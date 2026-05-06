import { createClient } from "@/lib/supabase/server";
import { MarketsClient } from "./markets-client";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";

export default async function MarketsPage() {
  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .order("trending_score", { ascending: false });

  // Phase 3 defense-in-depth — drop markets attached to unverified creators.
  // Becomes redundant after Phase 4 cleans data.
  const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
  const verifiedMarkets = filterVerifiedMarkets(markets ?? [], verifiedSlugs);

  return <MarketsClient markets={verifiedMarkets} totalCount={verifiedMarkets.length} />;
}
