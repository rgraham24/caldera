import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import type { Market, Creator } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { data: heroMarkets },
    { data: breakingMarkets },
    { data: trendingCreators },
    { data: tokenStripCreators },
    { data: initialMarkets },
  ] = await Promise.all([
    // Hero carousel — up to 8 is_hero markets
    supabase
      .from("markets")
      .select("*")
      .eq("is_hero", true)
      .eq("status", "open")
      .order("total_volume", { ascending: false })
      .limit(8),

    // Breaking — 3 markets resolving soonest
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .gt("resolve_at", new Date().toISOString())
      .order("resolve_at", { ascending: true })
      .limit(3),

    // Trending tokens sidebar — top 5 by creator coin price
    supabase
      .from("creators")
      .select("*")
      .gt("creator_coin_price", 0)
      .order("creator_coin_price", { ascending: false })
      .limit(5),

    // Token strip — top 20 for the scrolling strip
    supabase
      .from("creators")
      .select("*")
      .order("creator_coin_price", { ascending: false })
      .limit(20),

    // Initial market grid — newest first (volume is seeded/zero until real trading)
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <HomeClient
      heroMarkets={(heroMarkets ?? []) as Market[]}
      breakingMarkets={(breakingMarkets ?? []) as Market[]}
      trendingCreators={(trendingCreators ?? []) as Creator[]}
      tokenStripCreators={(tokenStripCreators ?? []) as Creator[]}
      initialMarkets={(initialMarkets ?? []) as Market[]}
    />
  );
}
