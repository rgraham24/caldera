"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Market, Creator } from "@/types";
import { CATEGORIES } from "@/types";
import {
  formatCurrency,
  formatCompactCurrency,
  formatRelativeTime,
} from "@/lib/utils";
import { ChevronDown, Users } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { TrendingStrip } from "@/components/markets/TrendingStrip";
import dynamic from "next/dynamic";

// Only rendered when user clicks Buy — no need to include in initial bundle
const StakeModal = dynamic(
  () => import("@/components/markets/StakeModal").then((m) => ({ default: m.StakeModal })),
  { ssr: false }
);
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { getTokenSymbolDisplay } from "@/lib/utils/tokenSymbol";
import { HeroTagline } from "./_components/hero/HeroTagline";
import { LiveTicker } from "./_components/ticker/LiveTicker";

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeClientProps = {
  heroMarkets: Market[];
  /** Server-rendered slot for the hero (Suspense-streamed prices). */
  heroSlot?: React.ReactNode;
  /** Trending Now strip — non-hero markets, ordered by trending_score, top 12. */
  trendingStripMarkets: Market[];
  tokenStripCreators: Creator[];
  initialMarkets: Market[];
};

const PAGE_SIZE = 20;


// ─── Hot Topics horizontal strip ─────────────────────────────────────────────

// Special non-category filter modes that prefix the category strip.
// "Breaking" was removed in a homepage polish pass — it was a deprecated v1
// concept and the filter returned 0 markets, since /api/markets?sort=breaking
// requires created_at within 48h which doesn't apply to the curated catalog.
// Trending covers the same surface area.
const HOMEPAGE_SPECIAL_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "📈 Trending" },
  { value: "new", label: "🕐 New" },
  { value: "following", label: "Following" },
];

// Slugs that the homepage filter UI treats as non-creator filters.
// Includes every category from CATEGORIES + the special filters that aren't
// also categories (all is handled inline elsewhere).
const CATEGORY_FILTER_SLUGS: string[] = [
  ...CATEGORIES.map((c) => c.value),
  "new",
  "following",
];

// ─── Token strip ──────────────────────────────────────────────────────────────

/** Seeded mock trend: deterministic per slug, consistent per session, range −5% to +5% */
function slugTrend(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const raw = ((h % 1000) / 1000) * 10 - 5;
  return Math.round(raw * 10) / 10;
}

function TokenStrip({ creators: initialCreators, onBuy }: { creators: Creator[]; onBuy: (c: Creator) => void }) {
  const [creators, setCreators] = useState(initialCreators);
  const [flashing, setFlashing] = useState<Record<string, "up" | "down">>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  // Stable seeded trends — computed once from initial list
  const trends = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of initialCreators) map[c.slug] = slugTrend(c.slug);
    return map;
  }, [initialCreators]);

  // Poll for live prices every 30 seconds
  useEffect(() => {
    for (const c of initialCreators) prevPricesRef.current[c.slug] = c.creator_coin_price ?? 0;

    const poll = async () => {
      try {
        const res = await fetch("/api/creators/top?limit=20");
        if (!res.ok) return;
        const { data } = await res.json();
        if (!Array.isArray(data)) return;

        const newFlash: Record<string, "up" | "down"> = {};
        for (const c of data as Creator[]) {
          const prev = prevPricesRef.current[c.slug];
          const cur = c.creator_coin_price ?? 0;
          if (prev !== undefined && cur !== prev) {
            newFlash[c.slug] = cur > prev ? "up" : "down";
          }
          prevPricesRef.current[c.slug] = cur;
        }

        const deduped = (data as Creator[]).filter((t, i, arr) => arr.findIndex(x => x.slug === t.slug) === i);
        setCreators(deduped);
        if (Object.keys(newFlash).length > 0) {
          setFlashing(newFlash);
          setTimeout(() => setFlashing({}), 1000);
        }
      } catch { /* silent — polling is best-effort */ }
    };

    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [initialCreators]);

  if (creators.length === 0) return null;
  const doubled = [...creators, ...creators];

  return (
    <div className="relative w-full overflow-hidden" style={{ width: '100%', minWidth: '100%' }}>
      {/* Header */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-3 md:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">🔥 Trending Coins</span>
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            LIVE
          </span>
        </div>
        <Link href="/creators" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
          View all →
        </Link>
      </div>

      {/* Scrolling strip — floating cards on transparent background */}
      <div
        className="w-full max-w-full overflow-hidden bg-transparent [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent)",
        }}
      >
        <div className="flex bg-transparent animate-[scroll-left_60s_linear_infinite] gap-3 pb-3 hover:[animation-play-state:paused]" style={{ animationDelay: "-5s" }}>
          {doubled.map((c, i) => {
            const rank = i % creators.length;
            const isTop3 = rank < 3;
            const price = c.creator_coin_price ?? 0;
            const mcap = c.creator_coin_market_cap ?? 0;
            const holders = c.creator_coin_holders ?? 0;
            const momentum = holders > 1000 ? "🔥 Hot" : holders > 500 ? "↑ Rising" : null;
            const trend = trends[c.slug] ?? 0;
            const flash = flashing[c.slug];

            return (
              <Link
                key={`${c.id}-${i}`}
                href={`/creators/${c.slug}`}
                className="group flex shrink-0 flex-col gap-2 rounded-xl px-4 py-3.5 transition-all duration-200"
                style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${isTop3 ? "rgba(249,115,22,0.25)" : "var(--border-subtle)"}`,
                  boxShadow: isTop3 ? "0 0 12px rgba(249,115,22,0.10)" : "none",
                  minWidth: "210px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(249,115,22,0.5)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(249,115,22,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isTop3 ? "rgba(249,115,22,0.25)" : "var(--border-subtle)";
                  e.currentTarget.style.boxShadow = isTop3 ? "0 0 12px rgba(249,115,22,0.10)" : "none";
                }}
              >
                {/* Row 1: rank + avatar + $symbol */}
                <div className="flex items-center gap-2">
                  {isTop3 ? (
                    <span className="text-sm leading-none shrink-0">
                      {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
                    </span>
                  ) : (
                    <span className="w-4 shrink-0 text-center text-[10px] font-bold text-[var(--text-tertiary)]">{rank + 1}</span>
                  )}
                  <CreatorAvatar creator={c} size="sm" />
                  <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{getTokenSymbolDisplay(c)}</span>
                </div>

                {/* Row 2+3: Price and Mkt Cap columns with labels */}
                <div className="flex gap-4 pl-0.5">
                  {/* Price column */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Price</span>
                    <span className="font-mono text-sm font-semibold text-white tabular-nums">
                      {price > 0.01 ? formatCurrency(price) : "—"}
                    </span>
                  </div>

                  {/* Mkt Cap column */}
                  <div
                    className="flex flex-col gap-0.5 rounded-lg px-2 py-0.5 transition-colors duration-700"
                    style={{
                      background: flash === "up"
                        ? "rgba(34,197,94,0.15)"
                        : flash === "down"
                        ? "rgba(239,68,68,0.15)"
                        : "transparent",
                    }}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Mkt Cap</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm font-semibold text-white tabular-nums transition-all duration-500">
                        {mcap > 0 ? formatCompactCurrency(mcap) : "—"}
                      </span>
                      {trend !== 0 && (
                        <span className={`shrink-0 text-xs font-semibold tabular-nums ${trend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {trend > 0 ? "▲" : "▼"}{Math.abs(trend).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 4: holders + buy */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                    {holders > 0 ? `${holders.toLocaleString()} holders` : "—"}
                    {momentum && <span className="ml-1 text-[var(--accent)]">{momentum}</span>}
                  </span>
                  {c.deso_username && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuy(c); }}
                      className="rounded-md px-2.5 py-1 text-[10px] font-semibold opacity-0 transition-all group-hover:opacity-100"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      Buy →
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Market card ──────────────────────────────────────────────────────────────

function MarketCard({ market }: { market: Market }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const hoursLeft = market.resolve_at
    ? (new Date(market.resolve_at).getTime() - Date.now()) / 3_600_000
    : Infinity;
  const isUrgent = hoursLeft > 0 && hoursLeft < 24;
  const isSoon = hoursLeft >= 24 && hoursLeft < 72;

  return (
    <div
      className="group flex flex-col rounded-xl p-4 transition-colors"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          {market.category}
        </span>
        {isUrgent && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            TODAY
          </span>
        )}
        {isSoon && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
            {Math.ceil(hoursLeft / 24)}d left
          </span>
        )}
      </div>

      <Link href={`/markets/${market.slug}`} className="flex-1">
        <p className="mb-1 line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
      </Link>
      <div className="mb-1 flex items-center justify-between">
        <span
          className="text-xl font-bold tabular-nums"
          style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
        >
          {yes}%
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">chance</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div className="h-full rounded-full bg-yes" style={{ width: `${yes}%` }} />
      </div>

      <div className="mb-3 flex gap-2">
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
            YES {yes}¢
          </button>
        </Link>
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold text-red-400 bg-red-500/15 border border-red-500/20 hover:bg-red-500/25 transition-colors">
            NO {no}¢
          </button>
        </Link>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span className="font-mono">{formatCompactCurrency(market.total_volume ?? 0)} vol</span>
        <div className="flex items-center gap-2">
          {market.resolve_at && <span>{formatRelativeTime(market.resolve_at)}</span>}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const yesPrice = Math.round((market.yes_price || 0.5) * 100);
              const text = market.title + '\n\n' + yesPrice + '% chance YES on @CalderaMarket\n\ncaldera.market/markets/' + market.id;
              window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank', 'width=550,height=420');
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
            title="Share on X"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HomeClient({
  heroMarkets,
  heroSlot,
  trendingStripMarkets,
  tokenStripCreators,
  initialMarkets,
}: HomeClientProps) {
  const { isConnected } = useAppStore();
  const [activeFilter, setActiveFilter] = useState("all");
  const [sort, setSort] = useState("trending");
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [offset, setOffset] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(initialMarkets.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const marketsRef = useRef<HTMLDivElement>(null);
  const [endingSoonMarkets, setEndingSoonMarkets] = useState<Market[]>([]);

  const uniqueTokenStripCreators = useMemo(
    () => tokenStripCreators.filter((t, i, arr) => arr.findIndex((x) => x.slug === t.slug) === i),
    [tokenStripCreators]
  );

  // Ending Soon is the only remaining client-fetched homepage strip.
  // Trending Now and Hero are server-rendered. Featured was removed (the
  // 3-up hero carousel covers the same surface area).
  useEffect(() => {
    fetch("/api/markets?status=open&sort=resolving_soon&limit=14")
      .then((r) => r.json())
      .then((endingData) => {
        const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const endingSoon = (endingData.data ?? []).filter((m: Market) => {
          if (!m.resolve_at) return false;
          const t = new Date(m.resolve_at).getTime();
          return t > Date.now() && t < sevenDaysFromNow;
        });
        setEndingSoonMarkets(endingSoon.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  const fetchMarkets = useCallback(
    async (category: string, sortVal: string, off: number, append: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(off),
          status: "open",
        });
        const SPECIAL_FILTERS = ["all", "resolving_soon", "new", "following", "tokens"];
        const isCreatorFilter = category !== "all" && category !== "resolving_soon" && !CATEGORY_FILTER_SLUGS.includes(category);
        const effectiveSort = category === "resolving_soon" ? "resolving_soon"
          : category === "new" ? "newest"
          : sortVal;
        params.set("sort", effectiveSort);
        if (isCreatorFilter) {
          params.set("creator_slug", category);
        } else if (!SPECIAL_FILTERS.includes(category)) {
          params.set("category", category);
        }

        const res = await fetch(`/api/markets?${params}`, { signal: ctrl.signal });
        const json = await res.json();
        const fetched: Market[] = json.data ?? [];

        setMarkets((prev) => (append ? [...prev, ...fetched] : fetched));
        setOffset(off + fetched.length);
        setHasMore(fetched.length === PAGE_SIZE);
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Fetch markets when filter/sort changes
  useEffect(() => {
    setOffset(0);
    fetchMarkets(activeFilter, sort, 0, false);
  }, [activeFilter, sort, fetchMarkets]);

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* Hero — tagline + coupled-card grid streamed via Suspense.
            Right-rail sidebar (Breaking + Trending Coins) was removed in
            this commit; hero now spans the full container width so the
            3-up grid actually delivers 3 cards on lg+. Resolving-soon
            content lives in the existing "Ending Soon" section below.
            Coin discovery lives in the LIVE Trending Coins token strip. */}
        {heroMarkets.length > 0 && (
          <>
            <HeroTagline />
            <div className="mb-6">{heroSlot}</div>
          </>
        )}
        {/* TRENDING STRIP — right below hero (server-rendered, non-hero markets) */}
        <TrendingStrip markets={trendingStripMarkets} />
      </div>

      {/* Live activity ticker — full-width strip below hero */}
      <LiveTicker />

      {/* 3. Token strip */}
      <TokenStrip creators={uniqueTokenStripCreators} onBuy={setStakeCreator} />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* ENDING SOON */}
        {endingSoonMarkets.length > 0 && (
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">⏰ Ending Soon</h2>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Markets resolving in the next 7 days</p>
              </div>
            </div>
            <div
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
            >
              {endingSoonMarkets.map((market) => {
                const yes = Math.round((market.yes_price ?? 0.5) * 100);
                const msLeft = market.resolve_at ? new Date(market.resolve_at).getTime() - Date.now() : 0;
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
                const isUrgent = daysLeft <= 2;
                return (
                  <Link
                    key={market.id}
                    href={`/markets/${market.slug}`}
                    className="flex w-60 shrink-0 flex-col rounded-xl p-3 transition-colors"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(249,115,22,0.4)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-orange-400">{market.category}</div>
                    <p className="mb-auto line-clamp-2 text-sm font-semibold leading-tight text-[var(--text-primary)]">{market.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isUrgent ? "text-red-400" : "text-amber-400"}`}>
                        {hoursLeft < 24 ? `${hoursLeft}h left` : `${daysLeft}d left`}
                      </span>
                      <span className="text-sm font-bold text-emerald-400">{yes}% YES</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${yes}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ALL MARKETS */}
        <div ref={marketsRef} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">All markets</h2>
            <Link href="/markets" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
              View all →
            </Link>
          </div>
          {/* Category filter strip */}
          <div className="relative -mx-4 md:-mx-6 lg:-mx-8">
            <div
              className="flex gap-1 overflow-x-auto pb-1 px-4 md:px-6 lg:px-8"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
            >
              {[
                ...HOMEPAGE_SPECIAL_FILTERS,
                ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setActiveFilter(f.value); setOffset(0); }}
                  className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
                  style={{
                    background: activeFilter === f.value ? "var(--caldera-muted, #f9731615)" : "transparent",
                    color: activeFilter === f.value ? "var(--accent, #f97316)" : "var(--text-secondary)",
                    border: `1px solid ${activeFilter === f.value ? "var(--accent, #f97316)" : "var(--border-subtle)"}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Right fade — indicates more items */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[var(--bg)] to-transparent" />
          </div>
        </div>

        {/* Following empty state — shown when not connected */}
        {activeFilter === "following" && !isConnected ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-surface">
              <Users className="h-6 w-6 text-text-muted" />
            </div>
            <h3 className="mb-2 font-display text-lg font-bold text-text-primary">Follow your favorites</h3>
            <p className="mb-6 max-w-xs text-sm text-text-muted">
              Connect your DeSo wallet to follow creators and get a personalized feed
            </p>
            <button
              onClick={() => connectDeSoWallet()}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
            >
              Connect wallet
            </button>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div
              className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-4 ${loading ? "opacity-40 pointer-events-none" : "opacity-100"}`}
            >
              {markets.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>

            {markets.length === 0 && !loading && (
              <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">No markets found</p>
            )}
          </>
        )}

        {hasMore && !(activeFilter === "following" && !isConnected) && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => fetchMarkets(activeFilter, sort, offset, true)}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium transition-colors hover:border-[var(--border-default)] disabled:opacity-50"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              {loadingMore ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Show more
            </button>
          </div>
        )}
      </div>

      {stakeCreator && (
        <StakeModal
          creator={stakeCreator}
          isOpen
          onClose={() => setStakeCreator(null)}
          desoUsername={stakeCreator.deso_username}
          profilePicUrl={stakeCreator.profile_pic_url ?? stakeCreator.image_url}
        />
      )}
    </div>
  );
}
