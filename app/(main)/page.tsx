import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import { CATEGORIES } from "@/types";
import type { Market } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  // Hero carousel — up to 8 is_hero markets
  const { data: heroMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("is_hero", true)
    .eq("status", "open")
    .limit(8);

  // Trending — top 6 by volume
  const { data: trendingMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .order("total_volume", { ascending: false })
    .limit(6);

  // Top 4 per category — run in parallel
  const categoryResults = await Promise.all(
    CATEGORIES.map(({ value }) =>
      supabase
        .from("markets")
        .select("*")
        .eq("status", "open")
        .eq("category", value)
        .order("total_volume", { ascending: false })
        .limit(4)
        .then(({ data }) => ({ category: value, markets: (data ?? []) as Market[] }))
    )
  );

  const categoryMarkets = Object.fromEntries(
    categoryResults.map(({ category, markets }) => [category, markets])
  ) as Record<string, Market[]>;

  return (
    <HomeClient
      heroMarkets={(heroMarkets ?? []) as Market[]}
      trendingMarkets={(trendingMarkets ?? []) as Market[]}
      categoryMarkets={categoryMarkets}
    />
  );
}
