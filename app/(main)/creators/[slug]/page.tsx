import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CreatorProfileClient } from "./creator-profile-client";
import type { Market, Creator } from "@/types";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Try slug first, then deso_username as fallback
  let { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) {
    const { data: byUsername } = await supabase
      .from("creators")
      .select("*")
      .eq("deso_username", slug)
      .single();
    creator = byUsername;
  }

  if (!creator) notFound();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("creator_id", creator.id)
    .order("trending_score", { ascending: false });

  const { data: recentTrades } = await supabase
    .from("trades")
    .select("*, market:markets(title, slug)")
    .in("market_id", (markets ?? []).map((m) => m.id))
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <CreatorProfileClient
      creator={creator as Creator}
      markets={(markets ?? []) as Market[]}
      recentTrades={(recentTrades as unknown as Array<{
        id: string;
        side: string;
        quantity: number;
        price: number;
        created_at: string;
        market: { title: string; slug: string };
      }>) ?? []}
    />
  );
}
