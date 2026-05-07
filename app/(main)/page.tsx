import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./home-client";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
  dedupeCreatorsByPubkey,
} from "@/lib/creators/validity";
import type { Market, Creator } from "@/types";
import { HeroData } from "./_components/hero/HeroData";
import { HeroSkeleton } from "./_components/hero/HeroSkeleton";

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { data: heroRaw },
    { data: trendingStripRaw },
    { data: tokenStripCreators },
    { data: initialRaw },
  ] = await Promise.all([
    // Hero carousel — manually pinned (featured_score > 0) first, then trending_score.
    // 6 markets means the sliding-window carousel cycles through 6 distinct
    // windows of 3 cards (always full) instead of the 5-market split that
    // produced one full page + one 2-card stub.
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .order("featured_score", { ascending: false })
      .order("trending_score", { ascending: false })
      .limit(6),

    // Trending Now strip — non-hero markets ordered by trending_score.
    // Uses featured_score=0/NULL (NOT is_hero) because the is_hero column
    // is stale: only 2 of 6 hero markets have is_hero=true while all 6
    // have featured_score>0. featured_score is the source of truth for
    // hero membership (matches the hero carousel query above).
    // Filters to future-resolving so we never show past-due markets.
    supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .or("featured_score.eq.0,featured_score.is.null")
      .gt("resolve_at", new Date().toISOString())
      .order("trending_score", { ascending: false })
      .limit(12),

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

  // Look up creator slugs for markets that have a creator_id
  const allRaw = [...(heroRaw ?? []), ...(trendingStripRaw ?? []), ...(initialRaw ?? [])];
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
  // Use the denormalized creator_slug if present (the source of truth
  // since markets.creator_slug is filled in on insert). Fall back to
  // id-lookup only for legacy rows that have creator_id but no slug.
  // Inverting this caused Phase 3's verification filter to drop hero
  // markets when creator_id pointed at archived creator rows after
  // Phase 4b's dedupe.
  const withSlug = (m: Market): Market => ({
    ...m,
    creator_slug:
      m.creator_slug ??
      (m.creator_id ? (creatorSlugMap[m.creator_id] ?? null) : null),
  });

  // Phase 3 defense-in-depth — drop markets attached to unverified creators.
  // Becomes redundant after Phase 4 cleans data.
  const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
  const heroMarkets = filterVerifiedMarkets((heroRaw ?? []).map(withSlug), verifiedSlugs);
  const initialMarkets = filterVerifiedMarkets((initialRaw ?? []).map(withSlug), verifiedSlugs);
  const trendingStripMarkets = filterVerifiedMarkets(
    (trendingStripRaw ?? []).map(withSlug),
    verifiedSlugs
  );

  // Hero is rendered server-side as a slot. Markets data (titles, odds, vol)
  // is already in heroMarkets above and paints instantly via HeroSkeleton;
  // HeroData async-fetches fresh DeSo prices behind a Suspense boundary.
  // Pattern chosen over the proposed "portal/slot" approach because passing
  // a prebuilt ReactNode slot into HomeClient is dramatically simpler and
  // achieves the same streaming UX.
  const heroSlot = heroMarkets.length > 0 ? (
    <Suspense fallback={<HeroSkeleton markets={heroMarkets} />}>
      <HeroData markets={heroMarkets} />
    </Suspense>
  ) : null;

  return (
    <HomeClient
      heroMarkets={heroMarkets}
      heroSlot={heroSlot}
      trendingStripMarkets={trendingStripMarkets}
      tokenStripCreators={dedupeCreatorsByPubkey((tokenStripCreators ?? []) as Creator[])}
      initialMarkets={initialMarkets}
    />
  );
}
