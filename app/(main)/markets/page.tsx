import { createClient } from "@/lib/supabase/server";
import { MarketsClient } from "./markets-client";

export default async function MarketsPage() {
  const supabase = await createClient();

  const [{ data: markets }, { count }] = await Promise.all([
    supabase
      .from("markets")
      .select("*")
      .order("trending_score", { ascending: false }),
    supabase
      .from("markets")
      .select("*", { count: "exact", head: true }),
  ]);

  return <MarketsClient markets={markets ?? []} totalCount={count ?? 0} />;
}
