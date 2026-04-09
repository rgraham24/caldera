import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import type { Market, Creator } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { data: heroRaw },
    { data: breakingRaw },
    { data: trendingCreators },
    { data: tokenStripCreators },
    { data: initialRaw },
  ] = await Promise.all([
    // FIX 4: Hero carousel — top 8 open markets by volume (is_hero flag OR has volume)
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .or("is_hero.eq.true,total_volume.gt.0")
      .order("total_volume", { ascending: false })
      .limit(8),

    // Breaking — fetch 6 so dedup can still yield 3
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .gt("resolve_at", new Date().toISOString())
      .order("resolve_at", { ascending: true })
      .limit(6),

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

    // Initial market grid — newest first
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // FIX 1: Dedup breaking markets by id, keep first 3
  const breakingMarkets = (breakingRaw ?? [])
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    .slice(0, 3) as Market[];

  // FIX 3: Look up creator slugs for markets that have a creator_id
  const allRaw = [...(heroRaw ?? []), ...(initialRaw ?? [])];
  const creatorIds = [
    ...new Set(
      allRaw.map((m) => m.creator_id).filter((id): id is string => Boolean(id))
    ),
  ];
  const creatorSlugMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creatorRows } = await supabase
      .from("creators")
      .select("id, slug")
      .in("id", creatorIds);
    for (const c of creatorRows ?? []) {
      creatorSlugMap[c.id] = c.slug;
    }
  }
  const withSlug = (m: Market): Market => ({
    ...m,
    creator_slug: m.creator_id ? (creatorSlugMap[m.creator_id] ?? null) : null,
  });

  return (
    <HomeClient
      heroMarkets={(heroRaw ?? []).map(withSlug)}
      breakingMarkets={breakingMarkets}
      trendingCreators={(trendingCreators ?? []) as Creator[]}
      tokenStripCreators={(tokenStripCreators ?? []) as Creator[]}
      initialMarkets={(initialRaw ?? []).map(withSlug)}
    />
  );
}
