import { createClient } from "@/lib/supabase/server";
import { MarketsClient } from "./markets-client";

export default async function MarketsPage() {
  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .order("trending_score", { ascending: false });

  return <MarketsClient markets={markets ?? []} />;
}
