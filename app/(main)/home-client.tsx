"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { Market, Creator } from "@/types";
import { CATEGORIES } from "@/types";
import {
  formatCurrency,
  formatCompactCurrency,
  formatRelativeTime,
} from "@/lib/utils";
import { ChevronDown, TrendingUp, Zap } from "lucide-react";
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

const PAGE_SIZE = 20;

// ─── Hero section (Polymarket-style: tall card + pill chip row) ──────────────

function chipLabel(title: string): string {
  const words = title.split(" ");
  return words.slice(0, 5).join(" ") + (words.length > 5 ? "…" : "");
}

function HeroSection({ markets }: { markets: Market[] }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const chipRowRef = useRef<HTMLDivElement>(null);

  if (markets.length === 0) return null;

  const m = markets[idx];
  const yes = Math.round((m.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const hoursLeft = m.resolve_at
    ? (new Date(m.resolve_at).getTime() - Date.now()) / 3_600_000
    : Infinity;
  const isLive = hoursLeft > 0 && hoursLeft <= 168; // within 7 days

  const select = (i: number) => {
    if (i === idx) return;
    setVisible(false);
    setTimeout(() => { setIdx(i); setVisible(true); }, 160);
  };

  const scrollChips = (dir: -1 | 1) => {
    chipRowRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Main hero card — stretches to fill sidebar height ── */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden rounded-2xl p-7"
        style={{
          minHeight: "420px",
          background: "linear-gradient(160deg, #13131c 0%, #1a1a28 55%, #1e1830 100%)",
          border: "1px solid var(--border-subtle)",
          opacity: visible ? 1 : 0,
          transition: "opacity 160ms ease",
        }}
      >
        {/* Probability glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: yes >= 50
              ? "radial-gradient(ellipse at 90% 60%, rgba(34,197,94,0.08) 0%, transparent 65%)"
              : "radial-gradient(ellipse at 90% 60%, rgba(239,68,68,0.08) 0%, transparent 65%)",
          }}
        />

        <div className="relative flex flex-1 flex-col">
          {/* Top row: category pill + LIVE badge + resolve time */}
          <div className="mb-5 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--caldera-muted, #f9731615)", color: "var(--accent)" }}
            >
              {m.category}
            </span>
            {isLive && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                LIVE
              </span>
            )}
            {m.resolve_at && (
              <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                {formatRelativeTime(m.resolve_at)}
              </span>
            )}
          </div>

          {/* Title */}
          <Link href={`/markets/${m.slug}`}>
            <h2 className="mb-auto line-clamp-3 text-2xl font-bold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors sm:text-3xl">
              {m.title}
            </h2>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Probability number */}
          <div className="mb-2 flex items-end gap-3">
            <span
              className="text-6xl font-bold tabular-nums leading-none"
              style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
            >
              {yes}%
            </span>
            <span className="mb-2 text-sm text-[var(--text-tertiary)]">chance YES</span>
          </div>

          {/* Probability bar */}
          <div className="mb-6 h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full bg-yes"
              style={{ width: `${yes}%`, transition: "width 300ms ease" }}
            />
          </div>

          {/* YES / NO buttons */}
          <div className="mb-3 flex gap-3">
            <Link href={`/markets/${m.slug}`} className="flex-1">
              <button className="w-full rounded-xl py-4 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]">
                YES {yes}¢
              </button>
            </Link>
            <Link href={`/markets/${m.slug}`} className="flex-1">
              <button className="w-full rounded-xl py-4 text-sm font-bold text-white bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]">
                NO {no}¢
              </button>
            </Link>
          </div>

          {/* Volume */}
          <div className="text-right font-mono text-xs text-[var(--text-tertiary)]">
            {formatCompactCurrency(m.total_volume ?? 0)} vol
          </div>
        </div>
      </div>

      {/* ── Chip pill row with edge arrows ── */}
      {markets.length > 1 && (
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => scrollChips(-1)}
            className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/8"
            aria-label="Scroll left"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          <div
            ref={chipRowRef}
            className="flex flex-1 gap-2 overflow-x-auto pb-0.5"
            style={{
              scrollbarWidth: "none",
              maskImage: "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
            }}
          >
            {markets.map((chip, i) => {
              const isSelected = idx === i;
              return (
                <button
                  key={chip.id}
                  onClick={() => select(i)}
                  className="flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all"
                  style={{
                    background: isSelected ? "var(--text-primary)" : "var(--bg-surface)",
                    color: isSelected ? "var(--bg-surface)" : "var(--text-secondary)",
                    border: `1px solid ${isSelected ? "var(--text-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <span className="max-w-[160px] truncate">{chipLabel(chip.title)}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollChips(1)}
            className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/8"
            aria-label="Scroll right"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Breaking markets ─────────────────────────────────────────────────────────

function BreakingMarkets({ markets }: { markets: Market[] }) {
  return (
    <div className="flex flex-col rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="mb-3 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Breaking</h3>
      </div>
      <div className="flex flex-col justify-around flex-1 gap-3">
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

const RANK_STYLE = [
  { bg: "rgba(234,179,8,0.15)", color: "#eab308", label: "🥇" },
  { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "🥈" },
  { bg: "rgba(180,108,55,0.15)", color: "#b46c37", label: "🥉" },
];

function TrendingTokens({ creators, onBuy }: { creators: Creator[]; onBuy: (c: Creator) => void }) {
  return (
    <div className="flex flex-1 flex-col rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-[var(--accent)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Trending Tokens</h3>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)]">price · momentum</span>
      </div>
      <div className="flex flex-col justify-around flex-1 gap-2">
        {creators.map((c, i) => {
          const rank = RANK_STYLE[i];
          const holders = c.creator_coin_holders ?? 0;
          const momentum = holders > 1000 ? "🔥 Hot" : holders > 500 ? "↑ Rising" : null;
          return (
            <div key={c.id} className="flex items-center gap-2.5">
              {rank ? (
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: rank.bg, color: rank.color }}
                >
                  {rank.label}
                </span>
              ) : (
                <span className="w-5 shrink-0 text-center text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
              )}
              <CreatorAvatar creator={c} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  ${c.deso_username ?? c.creator_coin_symbol ?? c.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                    {formatCurrency(c.creator_coin_price ?? 0)}
                  </span>
                  {momentum && (
                    <span className="text-[10px] text-[var(--accent)]">{momentum}</span>
                  )}
                </div>
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
          );
        })}
      </div>
    </div>
  );
}

// ─── Token strip ──────────────────────────────────────────────────────────────

const CAT_EMOJI: Record<string, string> = {
  creators: "🎬", music: "🎵", sports: "⚽", tech: "💻", politics: "👑", entertainment: "🎭",
};

function TokenStrip({ creators, onBuy }: { creators: Creator[]; onBuy: (c: Creator) => void }) {
  if (creators.length === 0) return null;
  const doubled = [...creators, ...creators];

  return (
    <div style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated, #0d0d0d)" }} className="border-y">
      {/* Header */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 md:px-6 lg:px-8">
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">🔥 Trending Tokens</span>
        <Link href="/creators" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
          View all →
        </Link>
      </div>

      {/* Scrolling strip */}
      <div className="overflow-hidden pb-4">
        <div className="flex animate-[scroll-left_60s_linear_infinite] gap-3 px-4 hover:[animation-play-state:paused]">
          {doubled.map((c, i) => {
            const rank = i % creators.length;
            const isTop3 = rank < 3;
            const sym = c.deso_username ?? c.creator_coin_symbol ?? c.name;
            const price = c.creator_coin_price ?? 0;
            const holders = c.creator_coin_holders ?? 0;
            const emoji = c.category ? CAT_EMOJI[c.category] ?? "" : "";
            const momentum = holders > 1000 ? "🔥 Hot" : holders > 500 ? "↑ Rising" : null;

            return (
              <div
                key={`${c.id}-${i}`}
                className="group flex shrink-0 flex-col gap-2 rounded-xl px-4 py-3 transition-all duration-200 hover:scale-[1.03]"
                style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${isTop3 ? "rgba(249,115,22,0.25)" : "var(--border-subtle)"}`,
                  boxShadow: isTop3 ? "0 0 12px rgba(249,115,22,0.10)" : "none",
                  minWidth: "180px",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <CreatorAvatar creator={c} size="sm" />
                    {isTop3 && (
                      <span className="absolute -right-1 -top-1 animate-pulse text-[10px] leading-none">
                        {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {emoji && <span className="mr-1">{emoji}</span>}${sym}
                    </span>
                    <span className="font-mono text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                      {price > 0.01 ? formatCurrency(price) : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                    {holders > 0 ? `+${holders.toLocaleString()} holders` : "—"}
                    {momentum && <span className="ml-1 text-[var(--accent)]">{momentum}</span>}
                  </span>
                  {c.deso_username && (
                    <button
                      onClick={() => onBuy(c)}
                      className="rounded-md px-2.5 py-1 text-[10px] font-semibold opacity-0 transition-all group-hover:opacity-100"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      Buy →
                    </button>
                  )}
                </div>
              </div>
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
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* Hero section */}
        {(heroMarkets.length > 0 || breakingMarkets.length > 0 || trendingCreators.length > 0) && (
          <div className="mb-8 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_340px]">
            {heroMarkets.length > 0 && (
              <HeroSection markets={heroMarkets} />
            )}
            <div className="flex flex-col gap-4">
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
