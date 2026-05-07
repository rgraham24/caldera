/**
 * Async server component for the homepage hero. Joins the pre-fetched
 * hero markets with creator rows + a fresh DeSo price refresh, then hands
 * off to the client HeroCarousel.
 *
 * The slow work (DeSo refresh) is what we want streamed via Suspense; the
 * fast work (markets fetch) happens upstream in page.tsx so HeroSkeleton
 * can paint instantly with real titles/odds while prices load.
 */

import { createClient } from "@/lib/supabase/server";
import { refreshCreatorCoinPrices } from "@/lib/deso/refresh-creator-prices";
import { getCreatorCoinMomentumBatch } from "@/lib/deso/momentum";
import type { Market } from "@/types";
import type { HeroCard, HeroCreator } from "./types";
import { HeroCarousel } from "./HeroCarousel";

type HeroDataProps = {
  markets: Market[];
};

type CreatorRow = {
  slug: string;
  name: string;
  deso_username: string | null;
  image_url: string | null;
  creator_coin_symbol: string | null;
};

export async function HeroData({ markets }: HeroDataProps) {
  if (!markets.length) return null;

  const supabase = await createClient();

  const creatorSlugs = Array.from(
    new Set(markets.map((m) => m.creator_slug).filter((s): s is string => Boolean(s)))
  );

  const [{ data: creatorRows }, refreshed, momentumMap] = await Promise.all([
    creatorSlugs.length
      ? supabase
          .from("creators")
          .select("slug, name, deso_username, image_url, creator_coin_symbol")
          .in("slug", creatorSlugs)
      : Promise.resolve({ data: [] as CreatorRow[] }),
    refreshCreatorCoinPrices(creatorSlugs),
    getCreatorCoinMomentumBatch(creatorSlugs, 7),
  ]);

  const creatorBySlug = new Map<string, CreatorRow>();
  for (const c of (creatorRows ?? []) as CreatorRow[]) {
    creatorBySlug.set(c.slug, c);
  }

  const cards: HeroCard[] = markets.map((m) => {
    const slug = m.creator_slug ?? "";
    const row = slug ? creatorBySlug.get(slug) : undefined;
    const fresh = slug ? refreshed.get(slug) : undefined;
    if (!row) return { market: m, creator: null };
    const creator: HeroCreator = {
      slug: row.slug,
      name: row.name,
      deso_username: row.deso_username,
      image_url: row.image_url,
      coin_symbol: row.creator_coin_symbol ?? row.deso_username?.toUpperCase() ?? null,
      price_usd: fresh?.price ?? 0,
      holders: fresh?.holders ?? 0,
      coin_data_updated_at: fresh?.updated_at ?? new Date(0).toISOString(),
      // Real momentum once daily snapshots accumulate; null until then.
      // The card view hides the arrow when changePercent is null.
      momentum: momentumMap.get(slug) ?? null,
    };
    return { market: m, creator };
  });

  return <HeroCarousel cards={cards} />;
}
