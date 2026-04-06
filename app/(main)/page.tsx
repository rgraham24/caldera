import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import type { Creator } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  // Hero market — flagged or highest trending
  const { data: heroRow } = await supabase
    .from("markets")
    .select("*")
    .eq("is_hero", true)
    .eq("status", "open")
    .limit(1)
    .single();

  const heroMarket = heroRow ?? (await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(1)
    .single()).data;

  // All open markets
  const { data: allMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("trending_score", { ascending: false });

  // Resolved markets
  const { data: resolvedMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(6);

  // Recent trades for ticker
  const { data: recentTrades } = await supabase
    .from("trades")
    .select("*, market:markets(title, slug)")
    .order("created_at", { ascending: false })
    .limit(20);

  // Top creators
  const { data: rawCreators } = await supabase
    .from("creators")
    .select("*");

  const allCreators = rawCreators ?? [];
  const addChange = (c: typeof allCreators[0]) => ({
    ...c,
    price_change_24h: parseFloat(((Math.random() - 0.35) * 20).toFixed(1)),
  });

  // Unified token list — all entities sorted by coin price
  const sortedCreators = allCreators
    .sort((a, b) => {
      const aActive = a.deso_username && a.creator_coin_price > 1 ? 1 : 0;
      const bActive = b.deso_username && b.creator_coin_price > 1 ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      return b.creator_coin_price - a.creator_coin_price;
    })
    .slice(0, 16)
    .map(addChange);

  const teamTokens = allCreators
    .filter((c) => c.entity_type && c.entity_type !== "individual")
    .sort((a, b) => b.creator_coin_price - a.creator_coin_price)
    .slice(0, 8)
    .map(addChange);

  // Hero creator
  let heroCreator: Creator | null = null;
  if (heroMarket?.creator_id) {
    const { data } = await supabase
      .from("creators")
      .select("*")
      .eq("id", heroMarket.creator_id)
      .single();
    heroCreator = data as Creator | null;
  }

  // Stats
  const open = allMarkets ?? [];
  const totalVolume = open.reduce((s, m) => s + m.total_volume, 0);

  return (
    <HomeClient
      heroMarket={heroMarket}
      heroCreator={heroCreator}
      allMarkets={open}
      resolvedMarkets={resolvedMarkets ?? []}
      recentTrades={(recentTrades as unknown as Array<{
        id: string; side: string; gross_amount: number; created_at: string;
        market: { title: string; slug: string };
      }>) ?? []}
      creators={sortedCreators as (Creator & { price_change_24h: number })[]}
      teamTokens={teamTokens as (Creator & { price_change_24h: number })[]}
      totalVolume={totalVolume}
      activeMarketCount={open.length}
    />
  );
}
