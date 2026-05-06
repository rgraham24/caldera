import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // Pull the latest yes_price per open market. We sort by market_id then
  // recorded_at DESC and walk the list keeping the first row seen per
  // market_id. With the (market_id, recorded_at DESC) index this is an
  // index-ordered scan; no full table sort.
  const openMarketIds = (markets as Array<{ id: string }>).map((m) => m.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshotRows } = await (supabase as any)
    .from("market_price_history")
    .select("market_id, yes_price, recorded_at")
    .in("market_id", openMarketIds)
    .order("market_id", { ascending: true })
    .order("recorded_at", { ascending: false });

  const latestPriceByMarket = new Map<string, number>();
  if (Array.isArray(snapshotRows)) {
    for (const r of snapshotRows as Array<{
      market_id: string;
      yes_price: number | string;
    }>) {
      // First row per market_id wins (recorded_at DESC means newest first)
      if (!latestPriceByMarket.has(r.market_id)) {
        latestPriceByMarket.set(r.market_id, Number(r.yes_price));
      }
    }
  }

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
    yes_price: number | null;
    no_price: number | null;
    total_volume: number | null;
  }>) {
    const current = m.yes_price ?? 0.5;
    const last = latestPriceByMarket.get(m.id);
    if (last !== undefined && Math.abs(last - current) < PRICE_EPSILON) {
      skipped++;
      continue;
    }
    snapshots.push({
      market_id: m.id,
      yes_price: current,
      no_price: m.no_price ?? 0.5,
      total_volume: m.total_volume ?? 0,
    });
  }

  if (snapshots.length === 0) {
    console.log(
      `[snapshot-prices] No price changes; skipped=${skipped} of ${markets.length}`
    );
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

  console.log(
    `[snapshot-prices] Recorded ${total} snapshots; skipped ${skipped} unchanged of ${markets.length} open markets`
  );
  return NextResponse.json({
    snapshots: total,
    skipped,
    evaluated: markets.length,
  });
}
