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
    { data: volumeData },
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

    // Trending creators — top 12 with active tokens
    supabase
      .from("creators")
      .select("*")
      .in("token_status", ["active_unverified", "active_verified", "claimed"])
      .gt("creator_coin_price", 0)
      .order("creator_coin_price", { ascending: false })
      .limit(12),

    // Token strip — top 20 for the scrolling strip
    supabase
      .from("creators")
      .select("*")
      .order("creator_coin_price", { ascending: false })
      .limit(20),

    // Initial market grid with creator join for social proof
    supabase
      .from("markets")
      .select("*, creator:creators!creator_id(creator_coin_holders, creator_coin_price, deso_username)")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),

    // Category volume data for hot-category indicators
    supabase
      .from("markets")
      .select("category, total_volume")
      .eq("status", "open"),
  ]);

  // Compute hot categories (total volume > $10,000)
  const categoryVolumes: Record<string, number> = {};
  for (const m of volumeData ?? []) {
    const cat = (m.category as string).toLowerCase();
    categoryVolumes[cat] = (categoryVolumes[cat] ?? 0) + ((m.total_volume as number) ?? 0);
  }
  const hotCategories = Object.entries(categoryVolumes)
    .filter(([, vol]) => vol > 10_000)
    .map(([cat]) => cat);

  return (
    <HomeClient
      heroMarkets={(heroMarkets ?? []) as Market[]}
      breakingMarkets={(breakingMarkets ?? []) as Market[]}
      trendingCreators={(trendingCreators ?? []) as Creator[]}
      tokenStripCreators={(tokenStripCreators ?? []) as Creator[]}
      initialMarkets={(initialMarkets ?? []) as Market[]}
      hotCategories={hotCategories}
    />
  );
}
