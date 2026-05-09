import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncUserProfileWithResult } from "@/lib/deso/syncProfile";

/**
 * GET /api/cron/backfill-creator-profiles
 *
 * Nightly cron that walks the 12.5k DeSo-imported creators who never
 * logged into Caldera and refreshes their bio/follower count/market
 * cap/etc from live DeSo profiles. Same pipeline as the on-login
 * syncUserProfile path, just driven by cron instead of a session.
 *
 * Order:
 *   1. coin_data_updated_at IS NULL (never synced) — first
 *   2. coin_data_updated_at < 7d ago (stale) — second
 * Newer rows are skipped until they age past 7d.
 *
 * Throughput:
 *   - 300 creators per run, ~600ms throttle between calls
 *   - Each syncUserProfileWithResult fires 3 parallel DeSo calls
 *   - Effective rate: ~5 DeSo req/sec sustained
 *   - 300/day × 42 days clears the 12.5k unsynced backlog
 *
 * If Vercel kills the function at maxDuration, partial progress is
 * already committed; tomorrow's run picks up where this one stopped
 * because we order by coin_data_updated_at NULLS FIRST.
 *
 * Auth: Bearer <CRON_SECRET>
 * Heartbeat: platform_config[cron_backfill_profiles_last_run]
 *
 * Manual run:
 *   curl -H "Authorization: Bearer caldera-cron-2026" \
 *     https://caldera.market/api/cron/backfill-creator-profiles
 */

export const runtime = "nodejs";
export const maxDuration = 540; // 9 minutes — Vercel Pro ceiling

const BATCH_LIMIT = 300;
const THROTTLE_MS = 600;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const cronSecret = process.env.CRON_SECRET ?? "caldera-cron-2026";
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    await writeHeartbeat({ ok: false, error: "auth-mismatch", startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: queryErr } = await (supabase as any)
    .from("creators")
    .select("id, slug, deso_public_key, coin_data_updated_at")
    .not("deso_public_key", "is", null)
    .or(
      `coin_data_updated_at.is.null,coin_data_updated_at.lt.${staleCutoff}`
    )
    .order("coin_data_updated_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (queryErr) {
    console.error("[cron/backfill-profiles] lookup failed:", queryErr);
    await writeHeartbeat({ ok: false, error: queryErr.message, startedAt });
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const creators = (rows ?? []) as Array<{
    id: string;
    slug: string;
    deso_public_key: string;
    coin_data_updated_at: string | null;
  }>;

  if (creators.length === 0) {
    console.log("[cron/backfill-profiles] nothing to do — all rows fresh");
    await writeHeartbeat({
      ok: true,
      startedAt,
      processed: 0,
      successCount: 0,
      failureCount: 0,
      message: "all rows fresh",
    });
    return NextResponse.json({ status: "nothing_to_do", processed: 0 });
  }

  console.log(
    `[cron/backfill-profiles] starting batch of ${creators.length} (throttle ${THROTTLE_MS}ms)`
  );

  const t0 = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const errorSamples: string[] = [];

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    try {
      const result = await syncUserProfileWithResult(c.deso_public_key);
      if (result.ok) {
        successCount++;
      } else {
        failureCount++;
        if (errorSamples.length < 10) {
          errorSamples.push(`${c.slug}: ${result.error}`);
        }
      }
    } catch (err) {
      failureCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cron/backfill-profiles] ${c.slug} threw:`, msg);
      if (errorSamples.length < 10) {
        errorSamples.push(`${c.slug}: throw:${msg}`);
      }
    }

    // Progress log every 25 creators so it's easy to spot in Vercel.
    if ((i + 1) % 25 === 0) {
      console.log(
        `[cron/backfill-profiles] progress ${i + 1}/${creators.length} — ok=${successCount} fail=${failureCount}`
      );
    }

    if (i < creators.length - 1) {
      await sleep(THROTTLE_MS);
    }
  }

  const elapsedMs = Date.now() - t0;
  console.log(
    `[cron/backfill-profiles] done in ${elapsedMs}ms — ok=${successCount} failed=${failureCount}`
  );

  await writeHeartbeat({
    ok: true,
    startedAt,
    processed: creators.length,
    successCount,
    failureCount,
    elapsedMs,
    errorSamples,
  });

  return NextResponse.json({
    processed: creators.length,
    ok: successCount,
    failed: failureCount,
    elapsedMs,
    errors_sample: errorSamples,
  });
}

async function writeHeartbeat(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = createServiceClient();
    const value = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("platform_config")
      .upsert(
        {
          key: "cron_backfill_profiles_last_run",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
  } catch (err) {
    console.error("[cron/backfill-profiles] heartbeat write failed:", err);
  }
}
