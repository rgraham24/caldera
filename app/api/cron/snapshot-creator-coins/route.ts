import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { refreshCreatorCoinPrices } from "@/lib/deso/refresh-creator-prices";

/**
 * GET /api/cron/snapshot-creator-coins
 *
 * Daily cron — walks all active creators in batches of 50, refreshes
 * their DeSo prices (which also writes back to creators table), and
 * inserts a row into creator_coin_price_snapshots so we can compute
 * 1d/7d momentum on the homepage hero.
 *
 * Auth: Bearer <CRON_SECRET>
 *
 * Heartbeat: platform_config[cron_snapshot_coins_last_run]
 *
 * Runtime budget: ~14k creators / 50 = 280 batches; each batch fires 50
 * parallel get-single-profile calls capped at 1500ms each, so a batch
 * settles in roughly 0.5–1.5s. Total expected runtime ~3–7 minutes.
 */
export const maxDuration = 540; // 9 minutes — safe Pro-tier ceiling

const BATCH_SIZE = 50;

export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const cronSecret = process.env.CRON_SECRET ?? "caldera-cron-2026";
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    await writeHeartbeat({ ok: false, error: "auth-mismatch", startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Active = anything we want to keep refreshing. Skip explicitly-archived
  // creators so we don't waste DeSo calls on dead profiles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: queryErr } = await (supabase as any)
    .from("creators")
    .select("id, slug")
    .neq("token_status", "archived");

  if (queryErr) {
    console.error("[cron/snapshot-creator-coins] creator lookup failed:", queryErr);
    await writeHeartbeat({ ok: false, error: queryErr.message, startedAt });
    return NextResponse.json({ error: "creator lookup failed" }, { status: 500 });
  }

  const creators = (rows ?? []) as Array<{ id: string; slug: string }>;
  console.log(`[cron/snapshot-creator-coins] starting walk over ${creators.length} creators (batch size ${BATCH_SIZE})`);

  let totalSnapshotted = 0;
  let totalRefreshFailed = 0;
  let totalInsertFailed = 0;
  const t0 = Date.now();

  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    const batch = creators.slice(i, i + BATCH_SIZE);
    const slugs = batch.map((c) => c.slug);
    const idBySlug = new Map(batch.map((c) => [c.slug, c.id]));

    const refreshed = await refreshCreatorCoinPrices(slugs);

    const inserts: Array<{
      creator_slug: string;
      creator_id: string;
      price: number;
      holders: number;
      recorded_at: string;
    }> = [];
    for (const slug of slugs) {
      const fresh = refreshed.get(slug);
      if (!fresh) {
        totalRefreshFailed++;
        continue;
      }
      inserts.push({
        creator_slug: slug,
        creator_id: idBySlug.get(slug)!,
        price: fresh.price,
        holders: fresh.holders,
        recorded_at: fresh.updated_at,
      });
    }

    if (inserts.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any)
        .from("creator_coin_price_snapshots")
        .insert(inserts);
      if (insErr) {
        console.warn(
          `[cron/snapshot-creator-coins] batch ${i / BATCH_SIZE} insert failed:`,
          insErr.message
        );
        totalInsertFailed += inserts.length;
      } else {
        totalSnapshotted += inserts.length;
      }
    }
  }

  const elapsedMs = Date.now() - t0;
  console.log(
    `[cron/snapshot-creator-coins] done in ${elapsedMs}ms — snapshotted=${totalSnapshotted} refresh_failed=${totalRefreshFailed} insert_failed=${totalInsertFailed}`
  );

  await writeHeartbeat({
    ok: true,
    startedAt,
    creatorsScanned: creators.length,
    snapshotted: totalSnapshotted,
    refreshFailed: totalRefreshFailed,
    insertFailed: totalInsertFailed,
    elapsedMs,
  });

  return NextResponse.json({
    success: true,
    creatorsScanned: creators.length,
    snapshotted: totalSnapshotted,
    refreshFailed: totalRefreshFailed,
    insertFailed: totalInsertFailed,
    elapsedMs,
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
          key: "cron_snapshot_coins_last_run",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
  } catch (err) {
    console.error("[cron/snapshot-creator-coins] heartbeat write failed:", err);
  }
}
