import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import { CATEGORIES } from "@/types";
import type { Market } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { data: heroMarkets },
    { data: initialMarkets },
    ...categoryVolumes
  ] = await Promise.all([
    // Featured carousel — up to 6 is_hero markets
    supabase
      .from("markets")
      .select("*")
      .eq("is_hero", true)
      .eq("status", "open")
      .order("total_volume", { ascending: false })
      .limit(6),

    // Initial main grid — top 20 by volume
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .order("total_volume", { ascending: false })
      .limit(20),

    // Volume per category for sidebar Hot Topics
    ...CATEGORIES.map(({ value }) =>
      supabase
        .from("markets")
        .select("total_volume")
        .eq("status", "open")
        .eq("category", value)
        .then(({ data }) => ({
          category: value,
          volume: (data ?? []).reduce((s, m) => s + (m.total_volume ?? 0), 0),
          count: (data ?? []).length,
        }))
    ),
  ]);

  const hotTopics = (categoryVolumes as { category: string; volume: number; count: number }[])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.volume - a.volume);

  return (
    <HomeClient
      featuredMarkets={(heroMarkets ?? []) as Market[]}
      initialMarkets={(initialMarkets ?? []) as Market[]}
      hotTopics={hotTopics}
    />
  );
}
