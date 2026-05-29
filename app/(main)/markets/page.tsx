import { createClient } from "@/lib/supabase/server";
import { MarketsClient } from "./markets-client";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";

// searchParams is async in this Next version (Promise) — must be awaited.
// We read ?category and ?sort to seed the client's initial filter/sort so
// topic tiles + browse pills land pre-filtered instead of on the default
// Trending list.
const firstParam = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(2000);

  // Phase 3 defense-in-depth — drop markets attached to unverified creators.
  // Becomes redundant after Phase 4 cleans data.
  const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
  const verifiedMarkets = filterVerifiedMarkets(markets ?? [], verifiedSlugs);

  const params = await searchParams;
  const initialCategory = firstParam(params.category) ?? null;
  const initialSort = firstParam(params.sort);

  return (
    <MarketsClient
      markets={verifiedMarkets}
      totalCount={verifiedMarkets.length}
      initialCategory={initialCategory}
      initialSort={initialSort}
    />
  );
}
