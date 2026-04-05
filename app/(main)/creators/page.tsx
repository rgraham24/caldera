import { createClient } from "@/lib/supabase/server";
import { CreatorsClient } from "./creators-client";
import type { Creator } from "@/types";

export default async function CreatorsPage() {
  const supabase = await createClient();
  const { data: creators } = await supabase
    .from("creators")
    .select("*")
    .order("creator_coin_market_cap", { ascending: false });

  return <CreatorsClient creators={(creators ?? []) as Creator[]} />;
}
