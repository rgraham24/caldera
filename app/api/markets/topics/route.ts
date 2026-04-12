import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Get open markets with their creator info
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, category, creator_slug, total_volume, trending_score, yes_price, close_at, created_at")
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(200);

  if (!markets) return NextResponse.json({ topics: [] });

  // Group by creator_slug to create topic groups
  const topicMap = new Map<string, {
    slug: string;
    totalVolume: number;
    marketCount: number;
    topTrendingScore: number;
    topMarket: typeof markets[0];
  }>();

  for (const m of markets) {
    const key = m.creator_slug || m.category;
    if (!key) continue;
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
        totalVolume: m.total_volume ?? 0,
        marketCount: 1,
        topTrendingScore: m.trending_score ?? 0,
        topMarket: m,
      });
    }
  }

  // Sort by trending score and return top 10
  const topics = Array.from(topicMap.values())
    .filter(t => t.marketCount >= 1)
    .sort((a, b) => b.topTrendingScore - a.topTrendingScore)
    .slice(0, 10);

  return NextResponse.json({ topics });
}
