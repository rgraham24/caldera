import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";
import type { Market } from "@/types";
import { NewMarketsClient } from "./new-client";

export const PAGE_SIZE = 24;

/**
 * /new — newest-first market browse with Show More pagination.
 * Server-renders the first PAGE_SIZE markets so the page paints with
 * real data; subsequent batches load via /api/markets?sort=newest on
 * the client.
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

  return <NewMarketsClient initialMarkets={initialMarkets} pageSize={PAGE_SIZE} />;
}
