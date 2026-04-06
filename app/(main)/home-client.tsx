"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Market, Creator } from "@/types";
import { CATEGORIES } from "@/types";
import { MarketCard } from "@/components/markets/MarketCard";
import { StakeModal } from "@/components/markets/StakeModal";
import {
  formatCurrency,
  formatCompactCurrency,
  formatRelativeTime,
  formatPercent,
  cn,
} from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";

type RecentTrade = {
  id: string;
  side: string;
  gross_amount: number;
  created_at: string;
  market: { title: string; slug: string };
};

type HomeClientProps = {
  heroMarket: Market | null;
  heroCreator: Creator | null;
  allMarkets: Market[];
  resolvedMarkets: Market[];
  recentTrades: RecentTrade[];
  creators: (Creator & { price_change_24h: number })[];
  teamTokens: (Creator & { price_change_24h: number })[];
  totalVolume: number;
  activeMarketCount: number;
};

export function HomeClient({
  heroMarket,
  heroCreator,
  allMarkets,
  resolvedMarkets,
  recentTrades,
  creators,
  teamTokens,
  totalVolume,
  activeMarketCount,
}: HomeClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [watching, setWatching] = useState(247);
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setWatching((w) => w + Math.floor(Math.random() * 5) - 2);
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  const safeMarkets = allMarkets ?? [];
  const safeCreators = creators ?? [];
  const safeTeams = teamTokens ?? [];
  const safeTrades = recentTrades ?? [];
  const safeResolved = resolvedMarkets ?? [];

  const filtered = activeCategory
    ? safeMarkets.filter((m) => m.category === activeCategory)
    : safeMarkets;

  const trendingMarkets = safeMarkets
    .filter((m) => m.id !== heroMarket?.id)
    .slice(0, 3);

  const yesPercent = heroMarket ? Math.round(heroMarket.yes_price * 100) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <div>
      {/* Stat strip */}
      <div className="border-b border-border-subtle/30 bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 py-1.5 md:px-6 lg:px-8">
          <p className="text-[10px] text-text-muted">
            <span className="font-mono text-caldera">{formatCompactCurrency(totalVolume)}</span> traded ·{" "}
            <span className="font-mono text-caldera">{activeMarketCount}</span> markets ·{" "}
            <span className="font-mono text-caldera">8,200+</span> holders earning ·{" "}
            <span className="flex items-center gap-1 inline-flex"><span className="h-1 w-1 rounded-full bg-yes animate-pulse" /> Powered by DeSo</span>
          </p>
        </div>
      </div>

      {/* Activity ticker */}
      <div className="border-b border-border-subtle/20 bg-surface/30 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="flex animate-[scroll_30s_linear_infinite] gap-8 whitespace-nowrap py-2">
            {safeTrades.map((t) => (
              <span key={t.id} className="text-[11px] text-text-muted">
                {t.side === "yes" ? "📈" : "📉"}{" "}
                <span className={t.side === "yes" ? "text-yes" : "text-no"}>
                  {t.side.toUpperCase()}
                </span>{" "}
                on {t.market.title.slice(0, 40)}... · {formatCurrency(t.gross_amount)} · {formatRelativeTime(t.created_at)}
              </span>
            ))}
            {safeCreators.slice(0, 3).map((c) => (
              <span key={c.id} className="text-[11px] text-text-muted">
                {c.price_change_24h >= 0 ? "🔥" : "📉"} ${c.deso_username || c.creator_coin_symbol}{" "}
                <span className={c.price_change_24h >= 0 ? "text-yes" : "text-no"}>
                  {c.price_change_24h >= 0 ? "+" : ""}{c.price_change_24h.toFixed(1)}%
                </span> today
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Category nav */}
      <div className="border-b border-border-subtle/20 bg-background">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                !activeCategory ? "bg-caldera/10 text-caldera" : "text-text-muted hover:text-text-primary"
              )}
            >
              🔥 Trending
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveCategory(c.value)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  activeCategory === c.value ? "bg-caldera/10 text-caldera" : "text-text-muted hover:text-text-primary"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* Hero + Sidebar */}
        <div className="mb-8 flex flex-col gap-6 lg:flex-row">
          {/* LEFT — Hero Market */}
          {heroMarket && (
            <div className="flex-1 lg:max-w-[65%]">
              <div className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
                {/* Category + badges */}
                <div className="mb-3 flex items-center gap-2 text-xs text-text-muted">
                  <span className="capitalize">{heroMarket.category}</span>
                  {heroMarket.resolve_at && new Date(heroMarket.resolve_at).getTime() - Date.now() < 72 * 3600000 && (
                    <span className="rounded-full bg-no/10 px-2 py-0.5 text-[10px] font-semibold text-no">
                      RESOLVES SOON
                    </span>
                  )}
                  <span className="ml-auto font-mono text-caldera">
                    {formatCompactCurrency(heroMarket.total_volume)} Vol
                  </span>
                </div>

                {/* Title */}
                <Link href={`/markets/${heroMarket.slug}`}>
                  <h2 className="mb-4 font-display text-3xl font-bold tracking-tight text-text-primary hover:text-caldera transition-colors">
                    {heroMarket.title}
                  </h2>
                </Link>

                {/* Creator bar */}
                {heroCreator && (
                  <div className="mb-4 flex items-center gap-3">
                    <CreatorAvatar creator={heroCreator} size="sm" />
                    <Link href={`/creators/${heroCreator.slug}`} className="text-sm font-medium text-text-primary hover:text-caldera">
                      {heroCreator.name}
                    </Link>
                    <span className="font-mono text-xs text-text-muted">
                      {formatCurrency(heroCreator.creator_coin_price)}
                    </span>
                  </div>
                )}

                {/* Probability bars */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-right font-mono text-sm font-bold text-yes">YES</span>
                    <div className="flex-1 h-8 rounded-full bg-background overflow-hidden">
                      <div className="h-full rounded-full bg-yes/20 flex items-center pl-3" style={{ width: `${yesPercent}%` }}>
                        <span className="font-mono text-sm font-bold text-yes">{yesPercent}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-right font-mono text-sm font-bold text-no">NO</span>
                    <div className="flex-1 h-8 rounded-full bg-background overflow-hidden">
                      <div className="h-full rounded-full bg-no/20 flex items-center pl-3" style={{ width: `${noPercent}%` }}>
                        <span className="font-mono text-sm font-bold text-no">{noPercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live stats */}
                <div className="mb-4 flex items-center gap-4 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-no animate-pulse" />
                    {watching} watching
                  </span>
                  <span>{heroMarket.resolve_at && formatRelativeTime(heroMarket.resolve_at)}</span>
                </div>

                {/* Trade buttons */}
                <div className="flex gap-3">
                  <Link href={`/markets/${heroMarket.slug}`} className="flex-1">
                    <button className="w-full rounded-xl bg-yes/15 py-3 text-sm font-bold text-yes transition-colors hover:bg-yes/25">
                      Buy YES · {yesPercent}¢
                    </button>
                  </Link>
                  <Link href={`/markets/${heroMarket.slug}`} className="flex-1">
                    <button className="w-full rounded-xl bg-no/15 py-3 text-sm font-bold text-no transition-colors hover:bg-no/25">
                      Buy NO · {noPercent}¢
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT — Sidebar */}
          <div className="w-full lg:w-[35%] space-y-4">
            {/* Trending Now */}
            <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Trending Now</h3>
              <div className="space-y-3">
                {trendingMarkets.map((m) => (
                  <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary group-hover:text-caldera transition-colors">
                        {m.title}
                      </p>
                    </div>
                    <span className={cn("font-mono text-sm font-bold shrink-0", m.yes_price >= 0.5 ? "text-yes" : "text-no")}>
                      {formatPercent(m.yes_price)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Hot Creators */}
            <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Hot Creators</h3>
              <div className="space-y-3">
                {safeCreators.slice(0, 3).map((c) => {
                  const sym = c.deso_username || c.creator_coin_symbol;
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <Link href={`/creators/${c.slug}`} className="flex items-center gap-2 flex-1 min-w-0">
                        <CreatorAvatar creator={c} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">{c.name}</p>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-caldera">{c.creator_coin_price > 0.01 ? formatCurrency(c.creator_coin_price) : "Not active"}</span>
                            {c.price_change_24h >= 0 ? (
                              <ArrowUpRight className="h-3 w-3 text-yes" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-no" />
                            )}
                            <span className={cn("font-mono text-[10px]", c.price_change_24h >= 0 ? "text-yes" : "text-no")}>
                              {c.price_change_24h >= 0 ? "+" : ""}{c.price_change_24h.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </Link>
                      {c.deso_username && (
                        <button
                          onClick={() => setStakeCreator(c)}
                          className="shrink-0 rounded-lg bg-caldera/10 px-2.5 py-1 text-[10px] font-medium text-caldera hover:bg-caldera/20 transition-colors"
                        >
                          Buy ${sym}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recently Resolved */}
            {safeResolved.length > 0 && (
              <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Recently Called</h3>
                <div className="space-y-3">
                  {safeResolved.slice(0, 3).map((m) => (
                    <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-3 group">
                      <p className="flex-1 truncate text-sm text-text-primary group-hover:text-caldera transition-colors">
                        {m.title}
                      </p>
                      <span className={cn("text-xs font-bold", m.resolution_outcome === "yes" ? "text-yes" : "text-no")}>
                        {m.resolution_outcome?.toUpperCase()}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Unclaimed creator */}
            {(() => {
              const unclaimed = safeCreators.find((c) => c.tier === "unclaimed" && c.unclaimed_earnings_escrow > 0);
              if (!unclaimed) return null;
              return (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-400">Claim & Earn</h3>
                  <p className="text-sm text-text-muted">
                    <Link href={`/creators/${unclaimed.slug}`} className="font-medium text-text-primary hover:text-caldera">
                      {unclaimed.name}
                    </Link>{" "}
                    hasn&apos;t claimed{" "}
                    <span className="font-mono text-amber-400">{formatCurrency(unclaimed.unclaimed_earnings_escrow)}</span>{" "}
                    in earnings yet.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Trending Tokens — auto-scroll */}
        <div className="mb-8">
          <div className="mb-2 text-[11px] text-text-muted">Trending Tokens — hold to earn from every trade</div>
          <div className="overflow-hidden">
            <div className="flex gap-3 animate-[scroll-left_60s_linear_infinite] hover:[animation-play-state:paused]">
              {[...safeCreators, ...safeCreators].map((c, i) => {
                const sym = c.deso_username || c.creator_coin_symbol;
                const SPORT_EMOJI: Record<string, string> = { nba: "🏀", nfl: "🏈", mlb: "⚾", college_football: "🎓", college_basketball: "🎓" };
                const sportEmoji = c.sport ? SPORT_EMOJI[c.sport] || "" : "";
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex min-w-[210px] shrink-0 items-center gap-3 rounded-xl border border-border-subtle/30 bg-surface px-4 py-3 transition-all hover:border-border-visible/60"
                  >
                    <CreatorAvatar creator={c} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/creators/${c.slug}`} className="block truncate text-sm font-medium text-text-primary hover:text-caldera transition-colors">
                        {sportEmoji ? `${sportEmoji} ` : ""}{c.name}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-sm font-bold tracking-normal text-caldera">
                          {c.creator_coin_price > 0.01 ? formatCurrency(c.creator_coin_price) : "Not active"}
                        </span>
                        {c.league && (
                          <span className="rounded-full bg-caldera/10 px-1.5 py-0.5 text-[8px] font-semibold text-caldera">
                            {c.league}
                          </span>
                        )}
                        {!c.league && c.price_change_24h !== undefined && (
                          <span className={cn("font-mono text-[10px]", c.price_change_24h >= 0 ? "text-yes" : "text-no")}>
                            {c.price_change_24h >= 0 ? "+" : ""}{c.price_change_24h.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* All Markets grid */}
        <div>
          <h2 className="section-header mb-5">All Markets</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.filter((m) => m.id !== heroMarket?.id).map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-text-muted">No markets in this category</p>
          )}
        </div>
      </div>

      {/* StakeModal */}
      {stakeCreator && (
        <StakeModal
          creator={stakeCreator}
          isOpen={!!stakeCreator}
          onClose={() => setStakeCreator(null)}
          desoUsername={stakeCreator.deso_username}
        />
      )}
    </div>
  );
}
