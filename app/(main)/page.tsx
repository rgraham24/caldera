import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import type { LeaderboardEntry, Creator } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: featuredMarkets } = await supabase
    .from("markets")
    .select("*")
    .gt("featured_score", 0)
    .eq("status", "open")
    .order("featured_score", { ascending: false })
    .limit(6);

  const { data: trendingMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(9);

  const { data: resolvingSoon } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .lte(
      "resolve_at",
      new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    )
    .order("resolve_at", { ascending: true })
    .limit(5);

  const { data: resolvedMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(6);

  const { data: rawLeaderboard } = await supabase
    .from("leaderboard_snapshots")
    .select(
      "*, user:users(id, username, avatar_url, is_verified, reputation_score)"
    )
    .eq("period", "alltime")
    .order("rank", { ascending: true })
    .limit(5);

  const { data: volumeData } = await supabase
    .from("markets")
    .select("*");

  const { data: rawCreators } = await supabase
    .from("creators")
    .select("*");

  // Sort: DeSo-enabled first, then by coin price descending
  const sortedCreators = (rawCreators ?? [])
    .sort((a, b) => {
      const aHasDeso = a.deso_username ? 1 : 0;
      const bHasDeso = b.deso_username ? 1 : 0;
      if (bHasDeso !== aHasDeso) return bHasDeso - aHasDeso;
      return b.creator_coin_price - a.creator_coin_price;
    })
    .slice(0, 10);

  const creatorsWithChange = sortedCreators.map((c) => ({
    ...c,
    price_change_24h: parseFloat(((Math.random() - 0.35) * 20).toFixed(1)),
  }));

  const allMarkets = volumeData ?? [];
  const totalVolume = allMarkets.reduce((sum, m) => sum + (m.total_volume || 0), 0);
  const activeMarkets = allMarkets.filter((m) => m.status === "open").length;

  return (
    <HomeClient
      featuredMarkets={featuredMarkets ?? []}
      trendingMarkets={trendingMarkets ?? []}
      resolvingSoon={resolvingSoon ?? []}
      resolvedMarkets={resolvedMarkets ?? []}
      leaderboardEntries={
        (rawLeaderboard as unknown as LeaderboardEntry[]) ?? []
      }
      trendingCreators={creatorsWithChange as (Creator & { price_change_24h: number })[]}
      totalVolume={totalVolume}
      activeMarkets={activeMarkets}
    />
  );
}
