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
            <span className="absolute left-[8%] top-[20%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:0.5s]">YES 67%</span>
            <span className="absolute right-[10%] top-[30%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:1s]">NO 33%</span>
            <span className="absolute left-[12%] bottom-[30%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:1.5s]">YES 82%</span>
            <span className="absolute right-[8%] bottom-[25%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:0.8s]">YES 44%</span>
            <span className="absolute left-[20%] top-[60%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:2.2s]">NO 56%</span>
            <span className="absolute right-[18%] top-[65%] font-mono text-xs text-[var(--text-faint)] opacity-[0.04] animate-pulse [animation-delay:1.8s]">YES 91%</span>
          </div>

          <div className="relative z-10 max-w-3xl">
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-[var(--text-primary)] md:text-7xl">
              Predict anything.
              <br />
              Hold the token.
              <br />
              <span style={{ color: "var(--accent)" }}>Earn from every trade.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-lg text-lg text-[var(--text-secondary)]">
              The prediction market where token holders earn passive income from every trade — automatically.
            </p>

            {/* Large search bar */}
            <div className="relative mx-auto mt-8 max-w-md">
              <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search markets, people, or tokens..."
                className="w-full rounded-xl py-3.5 pl-12 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                style={{
                  height: "3rem",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
              />
            </div>

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/markets"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100"
              >
                Explore Markets →
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-lg px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors"
                style={{ border: "1px solid var(--border-default)" }}
              >
                How It Works
              </Link>
            </div>

            {/* Social proof */}
            <p className="mt-8 text-center text-sm text-[var(--text-tertiary)]">
              <span className="tabular-nums">{formatCompactCurrency(totalVolume)}</span> predicted ·{" "}
              <span className="tabular-nums">{activeMarketCount}</span> active markets ·{" "}
              8,200+ token holders
            </p>
          </div>
        </section>

        {/* HOW IT WORKS — 3 cards */}
        <section className="py-16 px-4" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-2 text-center text-2xl font-semibold text-[var(--text-primary)]">How it works</h2>
            <p className="mb-10 text-center text-sm text-[var(--text-secondary)]">Three things. That&apos;s it.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  icon: "🎯",
                  title: "Predict",
                  body: "Pick YES or NO on any outcome. Sports games, elections, earnings, anything.",
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
                  className="rounded-xl p-6 text-center"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="mb-3 text-3xl">{item.icon}</div>
                  <h3 className="mb-2 text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURED MARKETS */}
        {featuredMarkets.length > 0 && (
          <section className="py-16 px-4">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">What people are predicting right now</h2>
              <p className="mb-8 text-sm text-[var(--text-secondary)]">Click any market to trade.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredMarkets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
              <div className="mt-6 text-center">
                <Link
                  href="/markets"
                  className="text-sm font-medium text-[var(--accent)] transition-colors hover:opacity-80"
                >
                  See all {activeMarketCount} markets →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* TRENDING TOKENS strip */}
        {safeCreators.length > 0 && (
          <section className="py-12 px-4" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">Hold these tokens to earn passively</h2>
              <p className="mb-6 text-sm text-[var(--text-secondary)]">Token holders earn a share of every trade on that person&apos;s markets.</p>
              <div className="overflow-hidden">
                <div className="flex gap-3 animate-[scroll-left_60s_linear_infinite] hover:[animation-play-state:paused]">
                  {[...safeCreators, ...safeCreators].map((c, i) => {
                    const sym = c.deso_username || c.creator_coin_symbol;
                    const change = (c as Creator & { price_change_24h?: number }).price_change_24h ?? 0;
                    return (
                      <div
                        key={`${c.id}-${i}`}
                        className="flex min-w-[190px] shrink-0 items-center gap-3 rounded-xl px-4 py-3"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
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
          <div
            className="mx-auto max-w-2xl rounded-xl p-8 text-center"
            style={{ border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.04)" }}
          >
            <div className="mb-3 text-3xl">🏆</div>
            <h2 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">Are you on Caldera?</h2>
            <p className="mb-6 text-sm leading-relaxed text-[var(--text-secondary)]">
              Creators, athletes, and public figures can claim their profile and earn from every prediction about them.
              Your profile might already be here.
            </p>
            <Link
              href="/creators"
              className="inline-block rounded-lg px-6 py-3 text-sm font-semibold text-amber-400 transition-colors"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              Claim Your Profile →
            </Link>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-16 px-4 text-center" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
          <div className="mx-auto max-w-lg">
            <h2 className="mb-3 text-3xl font-semibold text-[var(--text-primary)]">Ready to start?</h2>
            <p className="mb-8 text-sm text-[var(--text-secondary)]">Connect your wallet to trade. Or just browse first.</p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100"
              >
                Connect Wallet & Trade →
              </Link>
              <Link
                href="/markets"
                className="rounded-lg px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors"
                style={{ border: "1px solid var(--border-default)" }}
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
                    <button
                      className="w-full rounded-lg py-3 text-sm font-semibold text-yes transition-colors min-h-[44px]"
                      style={{ background: "var(--yes-bg)", border: "1px solid rgba(34,197,94,0.2)" }}
                    >
                      Buy YES · {yesPercent}¢
                    </button>
                  </Link>
                  <Link href={`/markets/${activeHero.slug}`} className="flex-1">
                    <button
                      className="w-full rounded-lg py-3 text-sm font-semibold text-no transition-colors min-h-[44px]"
                      style={{ background: "var(--no-bg)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      Buy NO · {noPercent}¢
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
          <div className="mb-2 text-xs text-[var(--text-tertiary)]">Trending Tokens — hold to earn from every trade</div>
          <div className="overflow-hidden">
            <div className="flex gap-3 animate-[scroll-left_60s_linear_infinite] hover:[animation-play-state:paused]">
              {[...safeCreators, ...safeCreators].map((c, i) => {
                const sym = c.deso_username || c.creator_coin_symbol;
                const SPORT_EMOJI: Record<string, string> = { nba: "🏀", nfl: "🏈", mlb: "⚾", college_football: "🎓", college_basketball: "🎓" };
                const sportEmoji = c.sport ? SPORT_EMOJI[c.sport] || "" : "";
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex min-w-[210px] shrink-0 items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
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
