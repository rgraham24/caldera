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
};

export function HomeClient({
  heroMarket,
  heroCreator,
  allMarkets,
  resolvedMarkets,
  recentTrades,
  creators,
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
  const safeTrades = recentTrades ?? [];
  const safeResolved = resolvedMarkets ?? [];

  const CAT_MAP: Record<string, string[]> = {
    creators: ["creators", "streamers"],
    music: ["music"],
    sports: ["sports", "athletes"],
    tech: ["tech", "crypto"],
    politics: ["politics"],
    entertainment: ["entertainment", "viral"],
  };

  const matchesCat = (marketCat: string, filterCat: string | null) => {
    if (!filterCat) return true;
    const group = CAT_MAP[filterCat] || [filterCat];
    return group.includes(marketCat);
  };

  const filtered = safeMarkets.filter((m) => matchesCat(m.category, activeCategory));

  // Hero market switches to top market in selected category
  const categoryHero = activeCategory
    ? filtered.sort((a, b) => b.trending_score - a.trending_score)[0] || null
    : heroMarket;

  const trendingMarkets = safeMarkets
    .filter((m) => m.id !== (categoryHero?.id ?? heroMarket?.id))
    .slice(0, 3);

  const activeHero = categoryHero ?? heroMarket;
  const yesPercent = activeHero ? Math.round(activeHero.yes_price * 100) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <div>
      {/* Stat strip */}
      <div className="overflow-hidden" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="flex animate-[scroll_30s_linear_infinite] gap-8 whitespace-nowrap py-2">
            {safeTrades.map((t) => (
              <span key={t.id} className="flex items-center gap-1.5 text-xs">
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: t.side === "yes" ? "var(--yes)" : "var(--no)",
                    background: t.side === "yes" ? "var(--yes-bg)" : "var(--no-bg)",
                  }}
                >
                  {t.side.toUpperCase()}
                </span>
                <span className="text-[var(--text-secondary)]">{t.market.title.slice(0, 38)}</span>
                <span className="font-mono font-medium text-[var(--text-primary)] tabular-nums">{formatCurrency(t.gross_amount)}</span>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="text-[var(--text-tertiary)]">{formatRelativeTime(t.created_at)}</span>
              </span>
            ))}
            {safeCreators.slice(0, 3).map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 text-xs">
                <span className="font-mono text-[var(--text-secondary)]">${c.deso_username || c.creator_coin_symbol}</span>
                <span
                  className="font-mono font-medium tabular-nums"
                  style={{ color: c.price_change_24h >= 0 ? "var(--yes)" : "var(--no)" }}
                >
                  {c.price_change_24h >= 0 ? "+" : ""}{c.price_change_24h.toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Category nav */}
      <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                !activeCategory
                  ? "text-[var(--text-primary)] bg-[var(--bg-elevated)] border-[var(--border-default)]"
                  : "text-[var(--text-secondary)] bg-transparent border-transparent hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              )}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveCategory(c.value)}
                className={cn(
                  "shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                  activeCategory === c.value
                    ? "text-[var(--text-primary)] bg-[var(--bg-elevated)] border-[var(--border-default)]"
                    : "text-[var(--text-secondary)] bg-transparent border-transparent hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
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
          {activeHero && (
            <div className="flex-1 lg:max-w-[65%]">
              <div
                className="rounded-xl p-6"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                {/* Category + volume + date */}
                <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <span className="uppercase tracking-wider font-medium">{activeHero.category}</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{formatCompactCurrency(activeHero.total_volume)} Vol</span>
                  {activeHero.resolve_at && (
                    <>
                      <span>·</span>
                      <span>{formatRelativeTime(activeHero.resolve_at)}</span>
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-[var(--text-tertiary)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
                    {watching} watching
                  </span>
                </div>

                {/* Title */}
                <Link href={`/markets/${activeHero.slug}`}>
                  <h2 className="mb-4 text-2xl font-bold leading-tight text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]">
                    {activeHero.title}
                  </h2>
                </Link>

                {/* Creator bar */}
                {heroCreator && (
                  <div className="mb-5 flex items-center gap-3">
                    <CreatorAvatar creator={heroCreator} size="sm" />
                    <Link href={`/creators/${heroCreator.slug}`} className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                      {heroCreator.name}
                    </Link>
                    <span className="font-mono text-xs text-[var(--text-tertiary)] tabular-nums">
                      {formatCurrency(heroCreator.creator_coin_price)}
                    </span>
                  </div>
                )}

                {/* Probability — two numbers side by side */}
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-4xl font-bold tabular-nums text-yes leading-none">{yesPercent}%</p>
                    <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">YES</p>
                  </div>
                  <div className="h-12 w-px" style={{ background: "var(--border-default)" }} />
                  <div className="flex-1 text-center">
                    <p className="text-4xl font-bold tabular-nums text-no leading-none">{noPercent}%</p>
                    <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">NO</p>
                  </div>
                </div>

                {/* Probability bar */}
                <div
                  className="mb-5 h-1.5 w-full rounded-full"
                  style={{ background: "var(--border-subtle)" }}
                >
                  <div
                    className="h-full rounded-full bg-yes transition-all duration-500"
                    style={{ width: `${yesPercent}%` }}
                  />
                </div>

                {/* Trade buttons */}
                <div className="flex gap-3">
                  <Link href={`/markets/${activeHero.slug}`} className="flex-1">
                    <button className="w-full flex-1 py-4 rounded-xl font-bold text-base bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 transition-all duration-150 active:scale-[0.98] border border-emerald-400/30 flex flex-col items-center gap-0.5">
                      <span>YES</span>
                      <span className="text-sm opacity-80 font-mono font-normal">{yesPercent}¢</span>
                    </button>
                  </Link>
                  <Link href={`/markets/${activeHero.slug}`} className="flex-1">
                    <button className="w-full flex-1 py-4 rounded-xl font-bold text-base bg-red-500/90 hover:bg-red-400 text-white shadow-lg shadow-red-500/20 transition-all duration-150 active:scale-[0.98] border border-red-400/30 flex flex-col items-center gap-0.5">
                      <span>NO</span>
                      <span className="text-sm opacity-80 font-mono font-normal">{noPercent}¢</span>
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT — Sidebar */}
          <div className="w-full lg:w-[35%] space-y-4">
            {/* Hot Markets */}
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Hot Markets</h3>
              <div className="space-y-3">
                {trendingMarkets.map((m) => (
                  <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-3 group">
                    <p className="flex-1 truncate text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                      {m.title}
                    </p>
                    <span
                      className="font-mono text-sm font-bold tabular-nums shrink-0"
                      style={{ color: m.yes_price >= 0.5 ? "var(--yes)" : "var(--no)" }}
                    >
                      {formatPercent(m.yes_price)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Trending Tokens */}
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Trending Tokens</h3>
              <div className="space-y-3">
                {safeCreators.slice(0, 3).map((c) => {
                  const sym = c.deso_username || c.creator_coin_symbol;
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <Link href={`/creators/${c.slug}`} className="flex items-center gap-2 flex-1 min-w-0">
                        <CreatorAvatar creator={c} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs tabular-nums text-[var(--accent)]">
                              {c.creator_coin_price > 0.01 ? formatCurrency(c.creator_coin_price) : "Not active"}
                            </span>
                            {c.price_change_24h >= 0 ? (
                              <ArrowUpRight className="h-3 w-3 text-yes" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-no" />
                            )}
                            <span
                              className="font-mono text-[10px] tabular-nums"
                              style={{ color: c.price_change_24h >= 0 ? "var(--yes)" : "var(--no)" }}
                            >
                              {c.price_change_24h >= 0 ? "+" : ""}{c.price_change_24h.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </Link>
                      {c.deso_username && (
                        <button
                          onClick={() => setStakeCreator(c)}
                          className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors"
                          style={{ background: "var(--caldera-muted)", color: "var(--accent)" }}
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
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Recently Called</h3>
                <div className="space-y-3">
                  {safeResolved.slice(0, 3).map((m) => (
                    <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-3 group">
                      <p className="flex-1 truncate text-sm text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                        {m.title}
                      </p>
                      <span
                        className="text-xs font-bold shrink-0"
                        style={{ color: m.resolution_outcome === "yes" ? "var(--yes)" : "var(--no)" }}
                      >
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
          <div className="mb-2 text-xs text-[var(--text-tertiary)]">Own these tokens. Back the market.</div>
          <div className="overflow-hidden">
            <div className="flex gap-3 animate-[scroll-left_60s_linear_infinite] hover:[animation-play-state:paused]">
              {[...safeCreators, ...safeCreators].map((c, i) => {
                const SPORT_EMOJI: Record<string, string> = { nba: "🏀", nfl: "🏈", mlb: "⚾", college_football: "🎓", college_basketball: "🎓" };
                const sportEmoji = c.sport ? SPORT_EMOJI[c.sport] || "" : "";
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex min-w-[230px] shrink-0 flex-col rounded-xl px-4 py-3 gap-2"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
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
                    {c.deso_username && (
                      <button
                        onClick={() => setStakeCreator(c)}
                        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/10"
                      >
                        Buy ${c.deso_username || c.creator_coin_symbol}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* All Markets grid */}
        <div>
          <h2 className="mb-5 text-lg font-medium text-[var(--text-primary)]">All Markets</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.filter((m) => m.id !== activeHero?.id).map((m) => (
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
