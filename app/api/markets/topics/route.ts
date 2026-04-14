import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return "$0";
}

export async function GET() {
  const supabase = await createClient();

  // Get open markets
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, category, creator_slug, total_volume, trending_score, yes_price, close_at, created_at")
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(200);

  if (!markets) return NextResponse.json({ topics: [] });

  // Collect all creator slugs so we can look up their names in one query
  const creatorSlugs = [...new Set(markets.map((m) => m.creator_slug).filter(Boolean))] as string[];

  const creatorNameMap = new Map<string, string>();
  const creatorReservedMap = new Map<string, boolean>();
  const creatorCalderaVerifiedMap = new Map<string, boolean>();
  if (creatorSlugs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creatorsData } = await (supabase as any)
      .from("creators")
      .select("slug, name, deso_is_reserved, is_caldera_verified")
      .in("slug", creatorSlugs);
    for (const c of creatorsData ?? []) {
      creatorNameMap.set(c.slug, c.name);
      if (c.deso_is_reserved) creatorReservedMap.set(c.slug, true);
      if (c.is_caldera_verified) creatorCalderaVerifiedMap.set(c.slug, true);
    }
  }

  // Group by creator_slug (preferred) or category
  const topicMap = new Map<string, {
    slug: string;
    name: string;
    isReserved: boolean;
    isCalderaVerified: boolean;
    totalVolume: number;
    marketCount: number;
    topTrendingScore: number;
    topMarket: typeof markets[0];
  }>();

  for (const m of markets) {
    const key = m.creator_slug || m.category;
    if (!key) continue;
    const displayName = m.creator_slug
      ? (creatorNameMap.get(m.creator_slug) ?? (m.creator_slug.charAt(0).toUpperCase() + m.creator_slug.slice(1).replace(/-/g, " ")))
      : (m.category?.charAt(0).toUpperCase() + m.category.slice(1));

    const existing = topicMap.get(key);
    if (existing) {
      existing.totalVolume += m.total_volume ?? 0;
      existing.marketCount += 1;
      if ((m.trending_score ?? 0) > existing.topTrendingScore) {
        existing.topTrendingScore = m.trending_score ?? 0;
        existing.topMarket = m;
      }
    } else {
      topicMap.set(key, {
        slug: key,
        name: displayName,
        isReserved: m.creator_slug ? (creatorReservedMap.get(m.creator_slug) ?? false) : false,
        isCalderaVerified: m.creator_slug ? (creatorCalderaVerifiedMap.get(m.creator_slug) ?? false) : false,
        totalVolume: m.total_volume ?? 0,
        marketCount: 1,
        topTrendingScore: m.trending_score ?? 0,
        topMarket: m,
      });
    }
  }

  // Sort by topTrendingScore DESC (not volume — volume is seeded/simulated)
  const topics = Array.from(topicMap.values())
    .sort((a, b) => b.topTrendingScore - a.topTrendingScore)
    .slice(0, 12)
    .map((t) => ({
      ...t,
      // Show market count instead of (potentially fake) volume
      volumeFormatted: t.marketCount > 1 ? `${t.marketCount} markets` : null,
    }));

  return NextResponse.json({ topics });
}
