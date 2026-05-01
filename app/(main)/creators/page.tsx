import { createClient } from "@/lib/supabase/server";
import { CreatorsClient } from "./creators-client";

export const revalidate = 0;

export const metadata = {
  title: "Creators — Caldera",
};

export default async function CreatorsPage() {
  const supabase = await createClient();

  const { data: creators } = await supabase
    .from("creators")
    .select("*")
    .order("creator_coin_price", { ascending: false })
    .limit(200);

  return <CreatorsClient creators={creators ?? []} />;
}
