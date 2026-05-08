import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/snapshot-prices
 *
 * Hourly cron — writes a market_price_history row for each open market
 * whose yes_price changed since its most recent snapshot.
 *
 * Bloat-prevention rules:
 *   - Skip resolved/cancelled markets (status='open' filter on the read).
 *   - Compare current yes_price to the latest snapshot for each market.
 *     Insert only when changed (or when no prior snapshot exists).
 *
 * Auth: Bearer <CRON_SECRET>
 *
 * Heartbeat: platform_config[cron_snapshot_prices_last_run]
 */
export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    await writeHeartbeat({ ok: false, error: "auth-mismatch", startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("id, yes_price, no_price, total_volume")
    .eq("status", "open");

  if (!markets?.length) {
    return NextResponse.json({ snapshots: 0, skipped: 0 });
  }

  // Pull the latest yes_price per open market. The previous chunked
  // .in("market_id", chunkIds).order(...).limit-less query silently hit
  // Supabase's default 1000-row cap: with ~110 snapshots per market and
  // 100 markets per chunk, the cap returned 1000 rows covering only ~2
  // markets — the other 98 had no entry in latestPriceByMarket and got
  // a fresh INSERT every hour regardless of price movement. Same root
  // cause as the fetchVerifiedCreatorSlugs truncation fixed in 6704210.
  //
  // Fix: per-market point-lookups in parallel. Each query is one indexed
  // (market_id, recorded_at DESC) lookup with LIMIT 1, so the row cap
  // can't bite. Concurrency capped via a sliding window so we don't
  // open hundreds of connections at once.
  const openMarketIds = (markets as Array<{ id: string }>).map((m) => m.id);
  const latestPriceByMarket = new Map<string, number>();
  const CONCURRENCY = 50;
  for (let i = 0; i < openMarketIds.length; i += CONCURRENCY) {
    const batch = openMarketIds.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: row } = await (supabase as any)
          .from("market_price_history")
          .select("yes_price")
          .eq("market_id", id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (row && row.yes_price !== null && row.yes_price !== undefined) {
          latestPriceByMarket.set(id, Number(row.yes_price));
        }
      })
    );
  }
  console.log(
    `[snapshot-prices] Loaded latest prices for ${latestPriceByMarket.size}/${openMarketIds.length} open markets`
  );

  // Build the diff set: insert only when yes_price actually changed
  // (or when no prior snapshot exists for that market).
  const PRICE_EPSILON = 1e-6; // numeric column rounding tolerance
  const snapshots: Array<{
    market_id: string;
    yes_price: number;
    no_price: number;
    total_volume: number;
  }> = [];
  let skipped = 0;
  for (const m of markets as Array<{
    id: string;
    yes_price: number | string | null;
    no_price: number | string | null;
    total_volume: number | string | null;
  }>) {
    // Postgres NUMERIC columns deserialize to strings via Supabase JS.
    // Coerce explicitly so the diff math doesn't depend on JS string→number
    // coercion (which works but is silent if it ever stops).
    const current = m.yes_price !== null && m.yes_price !== undefined
      ? Number(m.yes_price)
      : 0.5;
    const last = latestPriceByMarket.get(m.id);
    if (last !== undefined && Math.abs(last - current) < PRICE_EPSILON) {
      skipped++;
      continue;
    }
    snapshots.push({
      market_id: m.id,
      yes_price: current,
      no_price: m.no_price !== null && m.no_price !== undefined ? Number(m.no_price) : 0.5,
      total_volume: m.total_volume !== null && m.total_volume !== undefined ? Number(m.total_volume) : 0,
    });
  }

  if (snapshots.length === 0) {
    console.log(
      `[snapshot-prices] No price changes; skipped=${skipped} of ${markets.length}`
    );
    await writeHeartbeat({
      ok: true,
      startedAt,
      evaluated: markets.length,
      snapshotted: 0,
      skipped,
      elapsedMs: Date.now() - t0,
    });
    return NextResponse.json({
      snapshots: 0,
      skipped,
      evaluated: markets.length,
    });
  }

  const chunkSize = 100;
  let total = 0;
  for (let i = 0; i < snapshots.length; i += chunkSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("market_price_history")
      .insert(snapshots.slice(i, i + chunkSize));
    if (!error) total += Math.min(chunkSize, snapshots.length - i);
  }

  const elapsedMs = Date.now() - t0;
  const dedupPct = markets.length > 0
    ? Math.round((skipped / markets.length) * 100)
    : 0;
  console.log(
    `[snapshot-prices] ${markets.length} markets, ${total} changed, ${skipped} unchanged (${dedupPct}% deduped)`
  );
  await writeHeartbeat({
    ok: true,
    startedAt,
    evaluated: markets.length,
    snapshotted: total,
    skipped,
    elapsedMs,
  });
  return NextResponse.json({
    snapshots: total,
    skipped,
    evaluated: markets.length,
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
          key: "cron_snapshot_prices_last_run",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
  } catch (err) {
    console.error("[cron/snapshot-prices] heartbeat write failed:", err);
  }
}
