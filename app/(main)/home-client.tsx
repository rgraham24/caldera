"use client";

import { useState, useEffect, useRef } from "react";
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
import { useAppStore } from "@/store";

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
  const { isAuthenticated } = useAppStore();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [watching, setWatching] = useState(247);
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Landing page for unauthenticated users
  if (!isAuthenticated) {
    const featuredMarkets = safeMarkets.slice(0, 3);
    return (
      <div className="overflow-x-hidden">
        {/* HERO */}
        <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-4 text-center">
          {/* Ambient background animations */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-caldera/5 blur-3xl animate-pulse" />
            <div className="absolute right-1/4 bottom-1/4 h-64 w-64 rounded-full bg-yes/5 blur-3xl animate-pulse [animation-delay:2s]" />
          </div>

          {/* Floating market probability numbers */}
          <div className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
            <span className="absolute left-[8%] top-[20%] font-mono text-xs text-text-faint opacity-40 animate-pulse [animation-delay:0.5s]">YES 67%</span>
            <span className="absolute right-[10%] top-[30%] font-mono text-xs text-text-faint opacity-40 animate-pulse [animation-delay:1s]">NO 33%</span>
            <span className="absolute left-[12%] bottom-[30%] font-mono text-xs text-text-faint opacity-40 animate-pulse [animation-delay:1.5s]">YES 82%</span>
            <span className="absolute right-[8%] bottom-[25%] font-mono text-xs text-text-faint opacity-40 animate-pulse [animation-delay:0.8s]">YES 44%</span>
            <span className="absolute left-[20%] top-[60%] font-mono text-xs text-text-faint opacity-30 animate-pulse [animation-delay:2.2s]">NO 56%</span>
            <span className="absolute right-[18%] top-[65%] font-mono text-xs text-text-faint opacity-30 animate-pulse [animation-delay:1.8s]">YES 91%</span>
          </div>

          <div className="relative z-10 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-caldera/20 bg-caldera/10 px-4 py-1.5 text-xs font-medium text-caldera">
              <span className="h-1.5 w-1.5 rounded-full bg-caldera animate-pulse" />
              Live on DeSo blockchain
            </div>

            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-text-primary md:text-7xl">
              Predict outcomes on{" "}
              <span className="text-caldera">real people.</span>
              <br />
              Hold their tokens.{" "}
              <span className="text-yes">Earn from every trade.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg text-text-muted">
              The first prediction market where holding tokens earns you passive income from every bet.
            </p>

            {/* Large search bar */}
            <div className="relative mx-auto mt-8 max-w-md">
              <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search markets, people, or tokens..."
                className="w-full rounded-2xl border border-border-subtle/50 bg-surface py-4 pl-12 pr-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
              />
            </div>

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/markets"
                className="rounded-xl bg-caldera px-8 py-3 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
              >
                Explore Markets →
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-xl border border-border-subtle/50 px-8 py-3 text-sm font-semibold text-text-muted hover:border-border-visible/60 hover:text-text-primary transition-colors"
              >
                How It Works
              </Link>
            </div>

            {/* Social proof */}
            <p className="mt-8 text-xs text-text-faint">
              <span className="font-mono text-caldera">{formatCompactCurrency(totalVolume)}</span> traded ·{" "}
              <span className="font-mono text-caldera">{activeMarketCount}</span> active markets ·{" "}
              <span className="font-mono text-caldera">8,200+</span> token holders
            </p>
          </div>
        </section>

        {/* HOW IT WORKS — 3 cards */}
        <section className="border-t border-border-subtle/20 bg-surface/30 py-16 px-4">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-2 text-center font-display text-3xl font-bold text-text-primary">How it works</h2>
            <p className="mb-10 text-center text-sm text-text-muted">Three things. That&apos;s it.</p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  icon: "🎯",
                  title: "Predict",
                  body: "Pick YES or NO on real events about real people. Get it right and earn. Simple.",
                },
                {
                  icon: "💎",
                  title: "Hold Tokens",
                  body: "Buy tokens tied to the people you believe in. Earn automatically from every prediction about them.",
                },
                {
                  icon: "🏆",
                  title: "Earn Together",
                  body: "The more people predict, the more token holders earn. No work required after you buy.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border-subtle/30 bg-surface p-6 text-center"
                >
                  <div className="mb-3 text-4xl">{item.icon}</div>
                  <h3 className="mb-2 font-display text-xl font-bold text-text-primary">{item.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURED MARKETS */}
        {featuredMarkets.length > 0 && (
          <section className="py-16 px-4">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-2 font-display text-3xl font-bold text-text-primary">What people are predicting right now</h2>
              <p className="mb-8 text-sm text-text-muted">Click any market to see the full detail and trade.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredMarkets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
              <div className="mt-6 text-center">
                <Link
                  href="/markets"
                  className="text-sm font-medium text-caldera hover:text-caldera/80 transition-colors"
                >
                  See all {activeMarketCount} markets →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* TRENDING TOKENS strip */}
        {safeCreators.length > 0 && (
          <section className="border-t border-border-subtle/20 bg-surface/30 py-12 px-4">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-2 font-display text-2xl font-bold text-text-primary">Hold these tokens to earn passively</h2>
              <p className="mb-6 text-sm text-text-muted">Token holders earn a share of every trade on that person&apos;s markets.</p>
              <div className="overflow-hidden">
                <div className="flex gap-3 animate-[scroll-left_60s_linear_infinite] hover:[animation-play-state:paused]">
                  {[...safeCreators, ...safeCreators].map((c, i) => {
                    const sym = c.deso_username || c.creator_coin_symbol;
                    const change = (c as Creator & { price_change_24h?: number }).price_change_24h ?? 0;
                    return (
                      <div
                        key={`${c.id}-${i}`}
                        className="flex min-w-[190px] shrink-0 items-center gap-3 rounded-xl border border-border-subtle/30 bg-surface px-4 py-3"
                      >
                        <CreatorAvatar creator={c} size="md" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/creators/${c.slug}`} className="block truncate text-sm font-medium text-text-primary hover:text-caldera transition-colors">
                            {c.name}
                          </Link>
                          <div className="flex items-center gap-1.5">
                            <span className="font-display text-sm font-bold text-caldera">
                              {c.creator_coin_price > 0.01 ? formatCurrency(c.creator_coin_price) : "Not active"}
                            </span>
                            <span className={cn("font-mono text-[10px]", change >= 0 ? "text-yes" : "text-no")}>
                              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[9px] text-text-faint">${sym}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* CREATOR CTA */}
        <section className="py-16 px-4">
          <div className="mx-auto max-w-2xl rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
            <div className="mb-3 text-3xl">🏆</div>
            <h2 className="mb-2 font-display text-2xl font-bold text-text-primary">Are you on Caldera?</h2>
            <p className="mb-6 text-sm text-text-muted leading-relaxed">
              Creators, athletes, and public figures can claim their profile and earn from every prediction about them.
              Your profile might already be here.
            </p>
            <Link
              href="/creators"
              className="inline-block rounded-xl bg-amber-500/20 px-6 py-3 text-sm font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              Claim Your Profile →
            </Link>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="border-t border-border-subtle/20 bg-surface/50 py-16 px-4 text-center">
          <div className="mx-auto max-w-lg">
            <h2 className="mb-3 font-display text-3xl font-bold text-text-primary">Ready to start?</h2>
            <p className="mb-8 text-sm text-text-muted">Connect your DeSo wallet to trade. Or just browse first.</p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-xl bg-caldera px-8 py-3 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
              >
                Connect Wallet & Trade →
              </Link>
              <Link
                href="/markets"
                className="rounded-xl border border-border-subtle/50 px-8 py-3 text-sm font-semibold text-text-muted hover:border-border-visible/60 hover:text-text-primary transition-colors"
              >
                Browse Markets →
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

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
                "shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
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
                  "shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
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
          {activeHero && (
            <div className="flex-1 lg:max-w-[65%]">
              <div className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
                {/* Category + badges */}
                <div className="mb-3 flex items-center gap-2 text-xs text-text-muted">
                  <span className="capitalize">{activeHero.category}</span>
                  {activeHero.resolve_at && new Date(activeHero.resolve_at).getTime() - Date.now() < 72 * 3600000 && (
                    <span className="rounded-full bg-no/10 px-2 py-0.5 text-[10px] font-semibold text-no">
                      RESOLVES SOON
                    </span>
                  )}
                  <span className="ml-auto font-mono text-caldera">
                    {formatCompactCurrency(activeHero.total_volume)} Vol
                  </span>
                </div>

                {/* Title */}
                <Link href={`/markets/${activeHero.slug}`}>
                  <h2 className="mb-4 font-display text-3xl font-bold tracking-tight text-text-primary hover:text-caldera transition-colors">
                    {activeHero.title}
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
                  <span>{activeHero.resolve_at && formatRelativeTime(activeHero.resolve_at)}</span>
                </div>

                {/* Trade buttons */}
                <div className="flex gap-3">
                  <Link href={`/markets/${activeHero.slug}`} className="flex-1">
                    <button className="w-full rounded-xl bg-yes/15 py-3 text-sm font-bold text-yes transition-colors hover:bg-yes/25">
                      Buy YES · {yesPercent}¢
                    </button>
                  </Link>
                  <Link href={`/markets/${activeHero.slug}`} className="flex-1">
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

            {/* Trending Tokens */}
            <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Trending Tokens</h3>
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
