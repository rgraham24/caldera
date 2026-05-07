import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";
import type { Market } from "@/types";
import { NewMarketsClient, type PriceHistoryPoint } from "./new-client";

export const PAGE_SIZE = 24;
const HISTORY_POINTS_PER_MARKET = 20;

/**
 * /new — newest-first market browse with Show More pagination + real
 * sparklines from market_price_history. Server-renders the first
 * PAGE_SIZE markets and their sparkline data so the page paints with
 * real charts, not an empty card flash.
 */
export default async function NewMarketsPage() {
  const supabase = await createClient();

  const { data: rawMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
  const initialMarkets = filterVerifiedMarkets(
    (rawMarkets ?? []) as Market[],
    verifiedSlugs
  );

  // Fetch per-market sparkline history in parallel. One indexed query
  // per market — cheap at PAGE_SIZE (24) markets and matches what the
  // /api/markets/price-history endpoint does for Show More batches.
  const initialHistory: Record<string, PriceHistoryPoint[]> = {};
  await Promise.all(
    initialMarkets.map(async (m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("market_price_history")
        .select("recorded_at, yes_price")
        .eq("market_id", m.id)
        .order("recorded_at", { ascending: false })
        .limit(HISTORY_POINTS_PER_MARKET);
      const points = ((data ?? []) as Array<{ recorded_at: string; yes_price: number | string }>)
        .map((r) => ({ recorded_at: r.recorded_at, yes_price: Number(r.yes_price) }))
        .reverse();
      if (points.length > 0) initialHistory[m.id] = points;
    })
  );

  return (
    <NewMarketsClient
      initialMarkets={initialMarkets}
      initialHistory={initialHistory}
      pageSize={PAGE_SIZE}
    />
  );
}
