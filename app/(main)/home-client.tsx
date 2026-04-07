"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Market, Creator } from "@/types";
import { CATEGORIES } from "@/types";
import {
  formatCurrency,
  formatCompactCurrency,
  formatRelativeTime,
} from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronDown, TrendingUp, Zap, Clock } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { StakeModal } from "@/components/markets/StakeModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeClientProps = {
  heroMarkets: Market[];
  breakingMarkets: Market[];
  trendingCreators: Creator[];
  tokenStripCreators: Creator[];
  initialMarkets: Market[];
};

type NavTab = "trending" | "breaking" | "new" | string;

const PAGE_SIZE = 20;

// ─── Second nav bar ───────────────────────────────────────────────────────────

type NavItem =
  | { divider: true }
  | { id: string; label: string; icon?: React.ComponentType<{ className?: string }> };

const NAV_TABS: NavItem[] = [
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "breaking", label: "Breaking", icon: Zap },
  { id: "new", label: "New", icon: Clock },
  { divider: true },
  ...CATEGORIES.map(({ value, label }) => ({ id: value, label })),
];

function SecondNav({ active, onChange }: { active: NavTab; onChange: (tab: NavTab) => void }) {
  return (
    <div
      className="sticky top-[57px] z-30 border-b"
      style={{ background: "var(--bg-elevated, #0d0d0d)", borderColor: "var(--border-subtle)" }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <div className="flex items-center overflow-x-auto">
          {NAV_TABS.map((tab, i) => {
            if ("divider" in tab) {
              return (
                <div
                  key={`div-${i}`}
                  className="mx-2 h-4 w-px shrink-0 self-center"
                  style={{ background: "var(--border-subtle)" }}
                />
              );
            }
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className="flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  borderColor: isActive ? "var(--accent)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Hero carousel ────────────────────────────────────────────────────────────

function HeroCarousel({ markets }: { markets: Market[] }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (markets.length < 2) return;
    timerRef.current = setInterval(
      () => setIdx((i) => (i + 1) % markets.length),
      6000
    );
  }, [markets.length]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  if (markets.length === 0) return null;

  const m = markets[idx];
  const yes = Math.round((m.yes_price ?? 0.5) * 100);
  const no = 100 - yes;

  const go = (newIdx: number) => { setIdx(newIdx); resetTimer(); };
  const prev = () => go((idx - 1 + markets.length) % markets.length);
  const next = () => go((idx + 1) % markets.length);

  return (
    <div
      className="relative flex flex-col rounded-2xl p-6"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "var(--caldera-muted, #f9731615)", color: "var(--accent)" }}
        >
          {m.category}
        </span>
        {m.resolve_at && (
          <span className="text-xs text-[var(--text-tertiary)]">{formatRelativeTime(m.resolve_at)}</span>
        )}
      </div>

      <Link href={`/markets/${m.slug}`}>
        <h2 className="mb-5 line-clamp-2 text-xl font-bold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors sm:text-2xl">
          {m.title}
        </h2>
      </Link>

      <div className="mb-2 flex items-end gap-3">
        <span
          className="text-5xl font-bold tabular-nums leading-none"
          style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
        >
          {yes}%
        </span>
        <span className="mb-1.5 text-sm text-[var(--text-tertiary)]">chance YES</span>
      </div>

      <div className="mb-5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div
          className="h-full rounded-full bg-yes transition-all duration-500"
          style={{ width: `${yes}%` }}
        />
      </div>

      <div className="mb-4 flex gap-3">
        <Link href={`/markets/${m.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]">
            YES {yes}¢
          </button>
        </Link>
        <Link href={`/markets/${m.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]">
            NO {no}¢
          </button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {formatCompactCurrency(m.total_volume ?? 0)} vol
        </span>
        {markets.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={prev} className="rounded-full p-1.5 hover:bg-white/5 transition-colors" aria-label="Previous">
              <ChevronLeft className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
            <div className="flex gap-1.5">
              {markets.map((_, i) => (
                <button
                  key={i}
                  onClick={() => go(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === idx ? "16px" : "6px",
                    background: i === idx ? "var(--accent)" : "var(--border-default)",
                  }}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <button onClick={next} className="rounded-full p-1.5 hover:bg-white/5 transition-colors" aria-label="Next">
              <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Breaking markets ─────────────────────────────────────────────────────────

function BreakingMarkets({ markets }: { markets: Market[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="mb-3 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Breaking</h3>
      </div>
      <div className="space-y-3">
        {markets.map((m, i) => {
          const yes = Math.round((m.yes_price ?? 0.5) * 100);
          return (
            <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-3 group">
              <span className="w-4 shrink-0 text-center text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
              <p className="flex-1 line-clamp-2 text-xs font-medium leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                {m.title}
              </p>
              <span
                className="shrink-0 font-mono text-sm font-bold tabular-nums"
                style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
              >
                {yes}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trending tokens sidebar ──────────────────────────────────────────────────

function TrendingTokens({ creators, onBuy }: { creators: Creator[]; onBuy: (c: Creator) => void }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-[var(--accent)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Trending Tokens</h3>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)]">price · holders</span>
      </div>
      <div className="space-y-3">
        {creators.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2.5">
            <span className="w-4 shrink-0 text-center text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
            <CreatorAvatar creator={c} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                ${c.deso_username ?? c.creator_coin_symbol ?? c.name}
              </span>
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {formatCurrency(c.creator_coin_price ?? 0)} · {(c.creator_coin_holders ?? 0).toLocaleString()} holders
              </span>
            </div>
            {c.deso_username && (
              <button
                onClick={() => onBuy(c)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors"
                style={{ background: "var(--caldera-muted, #f9731615)", color: "var(--accent)" }}
              >
                Buy
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Token strip ──────────────────────────────────────────────────────────────

function TokenStrip({ creators, onBuy }: { creators: Creator[]; onBuy: (c: Creator) => void }) {
  if (creators.length === 0) return null;
  const doubled = [...creators, ...creators];
  return (
    <div
      className="overflow-hidden border-y py-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated, #0d0d0d)" }}
    >
      <div className="flex animate-[scroll-left_60s_linear_infinite] gap-4 hover:[animation-play-state:paused]">
        {doubled.map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            className="group flex shrink-0 items-center gap-3 rounded-xl px-4 py-2"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <CreatorAvatar creator={c} size="sm" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                ${c.deso_username ?? c.creator_coin_symbol ?? c.name}
              </span>
              <span className="font-mono text-[10px] text-[var(--accent)]">
                {(c.creator_coin_price ?? 0) > 0.01 ? formatCurrency(c.creator_coin_price ?? 0) : "—"}
              </span>
            </div>
            {c.deso_username && (
              <button
                onClick={() => onBuy(c)}
                className="hidden rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors group-hover:flex"
                style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
              >
                Buy
              </button>
            )}
          </div>
        ))}
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
      className="flex flex-col rounded-xl p-4 transition-colors"
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
        <p className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
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
        {market.resolve_at && <span>{formatRelativeTime(market.resolve_at)}</span>}
      </div>
    </div>
  );
}

// ─── Filter pills + sort ──────────────────────────────────────────────────────

const FILTER_PILLS = [
  { id: "all", label: "All" },
  ...CATEGORIES.map(({ value, label }) => ({ id: value, label })),
  { id: "resolving_soon", label: "⏰ Ending Soon" },
];

const SORT_OPTS = [
  { id: "volume", label: "Volume" },
  { id: "newest", label: "Newest" },
  { id: "resolving_soon", label: "Ending Soon" },
];

// ─── Main export ──────────────────────────────────────────────────────────────

export function HomeClient({
  heroMarkets,
  breakingMarkets,
  trendingCreators,
  tokenStripCreators,
  initialMarkets,
}: HomeClientProps) {
  const [activeTab, setActiveTab] = useState<NavTab>("trending");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sort, setSort] = useState("volume");
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [offset, setOffset] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(initialMarkets.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        // "resolving_soon" filter pill overrides sort
        const effectiveSort = category === "resolving_soon" ? "resolving_soon" : sortVal;
        params.set("sort", effectiveSort);
        if (category !== "all" && category !== "resolving_soon") {
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

  const handleTabChange = (tab: NavTab) => {
    let newSort = "volume";
    let newFilter = "all";
    if (tab === "breaking") { newSort = "resolving_soon"; }
    else if (tab === "new") { newSort = "newest"; }
    else if (tab !== "trending") { newFilter = tab; }
    setActiveTab(tab);
    setSort(newSort);
    setActiveFilter(newFilter);
    setOffset(0);
    fetchMarkets(newFilter, newSort, 0, false);
  };

  const handleFilterChange = (f: string) => {
    setActiveFilter(f);
    setOffset(0);
    fetchMarkets(f, sort, 0, false);
  };

  const handleSortChange = (s: string) => {
    setSort(s);
    setOffset(0);
    fetchMarkets(activeFilter, s, 0, false);
  };

  return (
    <div>
      {/* 1. Second nav */}
      <SecondNav active={activeTab} onChange={handleTabChange} />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* 2. Hero section */}
        {(heroMarkets.length > 0 || breakingMarkets.length > 0 || trendingCreators.length > 0) && (
          <div className="mb-8 flex flex-col gap-4 lg:flex-row">
            {heroMarkets.length > 0 && (
              <div className="lg:w-[65%]">
                <HeroCarousel markets={heroMarkets} />
              </div>
            )}
            <div className="flex flex-col gap-4 lg:w-[35%]">
              {breakingMarkets.length > 0 && <BreakingMarkets markets={breakingMarkets} />}
              {trendingCreators.length > 0 && (
                <TrendingTokens creators={trendingCreators} onBuy={setStakeCreator} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Token strip */}
      <TokenStrip creators={tokenStripCreators} onBuy={setStakeCreator} />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* 4. All markets */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">All markets</h2>
          <Link href="/markets" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
            View all →
          </Link>
        </div>

        {/* Filter pills */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTER_PILLS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleFilterChange(id)}
              className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all"
              style={
                activeFilter === id
                  ? { background: "var(--text-primary)", color: "var(--bg-surface)", borderColor: "var(--text-primary)" }
                  : { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort bar */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-[var(--text-tertiary)]">Sort:</span>
          {SORT_OPTS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSortChange(s.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                sort === s.id
                  ? { background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                  : { color: "var(--text-tertiary)", border: "1px solid transparent" }
              }
            >
              {s.label}
            </button>
          ))}
        </div>

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

        {hasMore && (
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
        />
      )}
    </div>
  );
}
