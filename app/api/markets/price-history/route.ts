import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/markets/price-history?ids=uuid1,uuid2,...
 *
 * Returns the most recent ≤20 yes_price snapshots per market, grouped
 * by market_id. Used by /new (and any future surface) to render real
 * sparklines on MarketCards loaded after the initial server fetch
 * (Show More batches).
 *
 * Response shape:
 *   { data: { [marketId]: Array<{ recorded_at, yes_price }> } }
 *
 * Snapshots are returned in chronological order (oldest first) so the
 * client can hand them straight to the sparkline component.
 *
 * Implementation: one indexed query per market in parallel via
 * Promise.all. Cleaner than a single global LIMIT (which would skew
 * coverage when one market is much chattier than others) and cheap
 * enough at our batch size — capped at MAX_IDS markets per request.
 */

const MAX_IDS = 100;
const POINTS_PER_MARKET = 20;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const supabase = await createClient();

  type Point = { recorded_at: string; yes_price: number };
  const results = await Promise.all(
    ids.map(async (id): Promise<[string, Point[]]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("market_price_history")
        .select("recorded_at, yes_price")
        .eq("market_id", id)
        .order("recorded_at", { ascending: false })
        .limit(POINTS_PER_MARKET);
      if (error || !data) return [id, []];
      // DB returns DESC; reverse so the sparkline reads left-to-right.
      const points: Point[] = (data as Array<{ recorded_at: string; yes_price: number | string }>)
        .map((r) => ({ recorded_at: r.recorded_at, yes_price: Number(r.yes_price) }))
        .reverse();
      return [id, points];
    })
  );

  const byMarket: Record<string, Point[]> = {};
  for (const [id, points] of results) {
    byMarket[id] = points;
  }

  return NextResponse.json({ data: byMarket });
}
