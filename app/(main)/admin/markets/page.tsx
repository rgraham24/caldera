import { createClient } from "@/lib/supabase/server";
import { AdminMarketsClient } from "./admin-markets-client";

export default async function AdminMarketsPage() {
  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  return <AdminMarketsClient markets={markets ?? []} />;
}
