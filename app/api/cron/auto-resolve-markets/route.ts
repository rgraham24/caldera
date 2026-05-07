import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/auto-resolve-markets
 * Daily 10am UTC cron — runs AI resolution on all overdue non-crypto markets.
 * Auth: Bearer <CRON_SECRET>
 *
 * Writes a heartbeat row to platform_config[cron_auto_resolve_last_run] on
 * every invocation (success or failure) so we can verify cron firing from
 * the DB without Vercel dashboard access.
 */
export async function GET(req: Request) {
  // VERY visible top-of-handler log so any Vercel-side invocation appears in
  // function logs even if subsequent code throws. Schedule changed from
  // `0 10 * * *` to `7 10 * * *` to avoid concurrent-cron collision at 10:00
  // UTC (4 other crons fired on the same minute and this one wasn't running).
  const startedAt = new Date().toISOString();
  const userAgent = req.headers.get("user-agent") ?? "(none)";
  const hasAuth = Boolean(req.headers.get("authorization"));
  console.log(
    `[cron/auto-resolve-markets] FIRING at=${startedAt} ua=${userAgent} hasAuth=${hasAuth}`
  );

  // Bump invocation counter for observability — distinguishes "Vercel
  // never invoked" (no row updates) from "Vercel invoked but auth failed"
  // (this row updates, last_run row gets auth-mismatch).
  await bumpInvocationCounter(startedAt, hasAuth);

  const cronSecret = process.env.CRON_SECRET ?? "caldera-cron-2026";
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    // Heartbeat the auth-failure case too — distinguishes "cron didn't fire"
    // from "cron fired but auth mismatched".
    await writeHeartbeat({ ok: false, error: "auth-mismatch" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";

  let result: Record<string, unknown> = {};
  try {
    const res = await fetch(`${appUrl}/api/admin/auto-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPassword }),
    });
    result = await res.json();
  } catch (err) {
    console.error("[cron/auto-resolve-markets] error:", err);
    await writeHeartbeat({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "auto-resolve call failed" }, { status: 500 });
  }

  const { processed, autoResolved, flaggedForReview, skipped } = result as {
    processed?: number;
    autoResolved?: unknown[];
    flaggedForReview?: unknown[];
    skipped?: unknown[];
  };

  console.log(
    `[cron/auto-resolve-markets] processed=${processed ?? 0} autoResolved=${autoResolved?.length ?? 0} flagged=${flaggedForReview?.length ?? 0} skipped=${skipped?.length ?? 0}`
  );

  await writeHeartbeat({
    ok: true,
    processed: processed ?? 0,
    autoResolved: autoResolved?.length ?? 0,
    flaggedForReview: flaggedForReview?.length ?? 0,
    skipped: skipped?.length ?? 0,
  });

  return NextResponse.json({
    success: true,
    processed: processed ?? 0,
    autoResolved: autoResolved?.length ?? 0,
    flaggedForReview: flaggedForReview?.length ?? 0,
    skipped: skipped?.length ?? 0,
  });
}

/**
 * Bump invocation counter at platform_config[cron_auto_resolve_invocations].
 * Fires BEFORE auth check so even unauthenticated invocations are observable.
 * Best-effort — failures must not break the cron.
 */
async function bumpInvocationCounter(timestamp: string, hasAuth: boolean): Promise<void> {
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from("platform_config")
      .select("value")
      .eq("key", "cron_auto_resolve_invocations")
      .maybeSingle();
    let count = 1;
    if (existing?.value) {
      try {
        const parsed = JSON.parse(existing.value as string);
        count = (typeof parsed.count === "number" ? parsed.count : 0) + 1;
      } catch {
        count = 1;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("platform_config")
      .upsert(
        {
          key: "cron_auto_resolve_invocations",
          value: JSON.stringify({
            count,
            last_at: timestamp,
            last_had_auth_header: hasAuth,
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
  } catch (err) {
    console.error("[cron/auto-resolve-markets] invocation counter failed:", err);
  }
}

/**
 * Writes a JSON snapshot to platform_config[cron_auto_resolve_last_run].
 * Best-effort — heartbeat failures must not break the cron.
 */
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
          key: "cron_auto_resolve_last_run",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
  } catch (err) {
    console.error("[cron/auto-resolve-markets] heartbeat write failed:", err);
  }
}
