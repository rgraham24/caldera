"use client";

import { useState } from "react";
import Link from "next/link";
import type { Market, LeaderboardEntry, Creator } from "@/types";
import { FeaturedMarkets } from "@/components/home/FeaturedMarkets";
import { TrendingCreatorCoins } from "@/components/home/TrendingCreatorCoins";
import { CategoryRow } from "@/components/home/CategoryRow";
import { TrendingMarkets } from "@/components/home/TrendingMarkets";
import { LeaderboardSnapshot } from "@/components/home/LeaderboardSnapshot";
import { MarketCard } from "@/components/markets/MarketCard";
import { formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { ProbabilityBadge } from "@/components/shared/ProbabilityBadge";
import { Search } from "lucide-react";

type HomeClientProps = {
  featuredMarkets: Market[];
  trendingMarkets: Market[];
  resolvingSoon: Market[];
  resolvedMarkets: Market[];
  leaderboardEntries: LeaderboardEntry[];
  trendingCreators: (Creator & { price_change_24h: number })[];
  totalVolume: number;
  activeMarkets: number;
};

export function HomeClient({
  featuredMarkets,
  trendingMarkets,
  resolvingSoon,
  resolvedMarkets,
  leaderboardEntries,
  trendingCreators,
  totalVolume,
  activeMarkets,
}: HomeClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredTrending = activeCategory
    ? trendingMarkets.filter((m) => m.category === activeCategory)
    : trendingMarkets;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      {/* Hero */}
      <section className="hero-glow mb-10 py-20 md:py-28">
        <h1 className="font-display text-6xl font-bold tracking-tight text-white md:text-8xl">
          The Market for People.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-text-muted">
          Predict outcomes. Take a stake. Earn from every trade.
        </p>

        <div className="mt-8 max-w-lg">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              placeholder="Search markets, creators, or public figures..."
              className="w-full rounded-xl border border-border-subtle bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="inline-flex flex-col rounded-xl border border-border-subtle bg-surface px-5 py-3">
            <span className="font-mono text-2xl font-bold tracking-normal text-caldera">
              {formatCompactCurrency(totalVolume)}
            </span>
            <span className="mt-1 text-xs uppercase tracking-widest text-text-muted">
              Total Volume
            </span>
          </div>
          <div className="inline-flex flex-col rounded-xl border border-border-subtle bg-surface px-5 py-3">
            <span className="font-mono text-2xl font-bold tracking-normal text-caldera">
              {activeMarkets}
            </span>
            <span className="mt-1 text-xs uppercase tracking-widest text-text-muted">
              Active Markets
            </span>
          </div>
          <div className="inline-flex flex-col rounded-xl border border-border-subtle bg-surface px-5 py-3">
            <span className="font-mono text-2xl font-bold tracking-normal text-caldera">
              8,200+
            </span>
            <span className="mt-1 text-xs uppercase tracking-widest text-text-muted">
              Stakeholders Earning
            </span>
          </div>
        </div>
      </section>

      {/* Featured */}
      <div className="mb-10">
        <FeaturedMarkets markets={featuredMarkets} />
      </div>

      {/* Trending Stakes */}
      <div className="mb-10">
        <TrendingCreatorCoins creators={trendingCreators} />
      </div>

      {/* Category filter */}
      <div className="mb-6">
        <CategoryRow
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
      </div>

      {/* Trending */}
      <div className="mb-10">
        <TrendingMarkets markets={filteredTrending} />
      </div>

      {/* Two-column: Resolving Soon + Leaderboard */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-10">
        {/* Resolving soon */}
        <section>
          <h2 className="section-header mb-5">
            Resolving Soon
          </h2>
          <div className="rounded-xl border border-border-subtle bg-surface divide-y divide-border-subtle">
            {resolvingSoon.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">
                No markets resolving soon
              </p>
            ) : (
              resolvingSoon.map((market) => (
                <Link
                  key={market.id}
                  href={`/markets/${market.slug}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {market.title}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {market.resolve_at && formatRelativeTime(market.resolve_at)}
                    </p>
                  </div>
                  <ProbabilityBadge probability={market.yes_price} size="sm" />
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Leaderboard */}
        <LeaderboardSnapshot entries={leaderboardEntries} />
      </div>

      {/* Recently resolved */}
      {resolvedMarkets.length > 0 && (
        <section>
          <h2 className="section-header mb-5">
            Recently Resolved
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {resolvedMarkets.map((market) => (
              <div
                key={market.id}
                className="min-w-[280px] max-w-[320px] flex-shrink-0"
              >
                <Link href={`/markets/${market.slug}`}>
                  <div className="rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-visible">
                    <p className="mb-2 text-sm font-medium text-text-primary line-clamp-2">
                      {market.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-bold ${
                          market.resolution_outcome === "yes"
                            ? "text-yes"
                            : "text-no"
                        }`}
                      >
                        Resolved{" "}
                        {market.resolution_outcome?.toUpperCase()}
                      </span>
                      <span className="font-mono text-xs text-text-muted">
                        {formatCompactCurrency(market.total_volume)}
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
