"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Market, Creator } from "@/types";
import {
  formatCurrency,
  formatCompactCurrency,
  formatRelativeTime,
} from "@/lib/utils";
import { ChevronDown, TrendingUp, Zap, Users } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { StakeModal } from "@/components/markets/StakeModal";
import { TrendingStrip } from "@/components/markets/TrendingStrip";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

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
  const chipContainerRef = useRef<HTMLDivElement>(null);
  const [heroNews, setHeroNews] = useState<{ title: string; url: string; source: string; age: string } | null>(null);

  // Auto-rotate every 6 seconds with crossfade
  useEffect(() => {
    if (markets.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((prev) => (prev + 1) % markets.length);
        setVisible(true);
      }, 300);
    }, 6000);
    return () => clearInterval(interval);
  }, [markets.length]);

  // Scroll active chip to center via querySelectorAll buttons
  useEffect(() => {
    const container = chipContainerRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll("button"));
    const activeBtn = buttons[idx];
    if (!activeBtn) return;
    const containerCenter = container.offsetWidth / 2;
    const btnCenter = activeBtn.offsetLeft + activeBtn.offsetWidth / 2;
    container.scrollTo({ left: btnCenter - containerCenter, behavior: "smooth" });
  }, [idx]);

  // Fetch top news headline for current hero market
  useEffect(() => {
    const m = markets[idx];
    if (!m?.id) return;
    setHeroNews(null);
    fetch(`/api/markets/${m.id}/news`)
      .then((r) => r.json())
      .then((d: { articles?: Array<{ title: string; url: string; source: string; age: string }> }) => {
        setHeroNews(d.articles?.[0] ?? null);
      })
      .catch(() => {});
  }, [idx, markets]);

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
    setTimeout(() => { setIdx(i); setVisible(true); }, 300);
  };

  return (
    <div className="flex h-full flex-col gap-3 min-w-0 overflow-hidden">
      {/* ── Main hero card — fixed height ── */}
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl p-7"
        style={{
          minHeight: "420px",
          maxHeight: "440px",
          background: "linear-gradient(160deg, #13131c 0%, #1a1a28 55%, #1e1830 100%)",
          border: "1px solid var(--border-subtle)",
          opacity: visible ? 1 : 0,
          transition: "opacity 300ms ease",
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
              <button className="flex-1 w-full rounded-lg bg-yes/10 border border-yes/20 text-yes text-sm font-semibold py-2 hover:bg-yes/20 transition-colors">
                YES {yes}¢
              </button>
            </Link>
            <Link href={`/markets/${m.slug}`} className="flex-1">
              <button className="flex-1 w-full rounded-lg bg-no/10 border border-no/20 text-no text-sm font-semibold py-2 hover:bg-no/20 transition-colors">
                NO {no}¢
              </button>
            </Link>
          </div>

          {/* Volume */}
          <div className="text-right font-mono text-xs text-[var(--text-tertiary)]">
            {formatCompactCurrency(m.total_volume ?? 0)} vol
          </div>

          {/* News teaser */}
          {heroNews && (
            <a
              href={heroNews.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 mt-3 text-xs text-muted-foreground hover:text-orange-400 transition-colors"
            >
              <span className="font-medium text-orange-400 shrink-0">{heroNews.source}</span>
              <span className="line-clamp-1 text-[var(--text-tertiary)]">{heroNews.title}</span>
            </a>
          )}
        </div>
      </div>

      {/* ── Chip navigation ── */}
      {markets.length > 1 && (
        <div className="relative overflow-hidden" style={{ marginTop: "12px" }}>
          {/* Edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#0e0c18] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#0e0c18] to-transparent" />
          {/* Scrollable chip track */}
          <div
            ref={chipContainerRef}
            className="flex gap-2 overflow-x-scroll py-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {/* Left spacer — lets first chip scroll to center */}
            <div className="flex-shrink-0" style={{ width: "50%", minWidth: "50%" }} />
            {markets.map((chip, i) => (
              <button
                key={chip.id}
                onClick={() => select(i)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-300 border ${
                  i === idx
                    ? "bg-primary/30 border-primary/60 text-white"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                }`}
              >
                {chip.title.length > 28 ? chip.title.substring(0, 28) + "…" : chip.title}
              </button>
            ))}
            {/* Right spacer — lets last chip scroll to center */}
            <div className="flex-shrink-0" style={{ width: "50%", minWidth: "50%" }} />
          </div>
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
            <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center gap-2 group">
              <span className="w-4 shrink-0 text-center text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: yes >= 50 ? "var(--yes)" : "var(--no)" }}
              />
              <p className="flex-1 truncate text-xs font-medium leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
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

// ─── Hot Topics horizontal strip ─────────────────────────────────────────────

const CATEGORY_FILTER_SLUGS = ["sports", "politics", "music", "tech", "entertainment", "creators", "crypto", "companies", "climate", "tokens", "new", "following"];

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
              <Link href={`/creators/${c.slug}`} className="flex-1 flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer min-w-0">
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
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    ${c.deso_username ?? c.creator_coin_symbol ?? c.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0">
                      <span className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">Price</span>
                      <span className="font-mono text-xs font-semibold text-white tabular-nums">
                        {(c.creator_coin_price ?? 0) > 0.01 ? formatCurrency(c.creator_coin_price ?? 0) : "—"}
                      </span>
                    </div>
                    {(c.creator_coin_market_cap ?? 0) > 0 && (
                      <div className="flex flex-col gap-0">
                        <span className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">Mkt Cap</span>
                        <span className="font-mono text-xs font-semibold text-white tabular-nums">
                          {formatCompactCurrency(c.creator_coin_market_cap ?? 0)}
                        </span>
                      </div>
                    )}
                    {momentum && (
                      <span className="text-[9px] text-[var(--accent)] self-end pb-px">{momentum}</span>
                    )}
                  </div>
                </div>
              </Link>
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
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">🔥 Trending Tokens</span>
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
            const sym = c.deso_username ?? c.creator_coin_symbol ?? c.name;
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
                  <span className="truncate text-xs font-semibold text-[var(--text-primary)]">${sym}</span>
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
      {market.category_token_slug && (
        <div className="flex items-center gap-1 mt-1.5 mb-2">
          <a
            href={`/creators/${market.category_token_slug}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-orange-400 font-medium hover:underline"
          >
            ${market.category_token_slug.replace("caldera-", "").toUpperCase()}
          </a>
          <span className="relative group cursor-help text-xs text-muted-foreground">
            · 1% burn 🔥
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-52 -translate-x-1/2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-text-muted shadow-lg group-hover:block">
              1% of this trade permanently reduces the token supply, making remaining tokens scarcer.
            </span>
          </span>
        </div>
      )}

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
  breakingMarkets,
  trendingCreators,
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
  const [featuredMarkets, setFeaturedMarkets] = useState<Market[]>([]);
  const [sportsMarkets, setSportsMarkets] = useState<Market[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<Market[]>([]);

  // Deduplicate trending tokens by slug
  const uniqueTrendingCreators = useMemo(
    () => trendingCreators.filter((t, i, arr) => arr.findIndex((x) => x.slug === t.slug) === i),
    [trendingCreators]
  );
  const uniqueTokenStripCreators = useMemo(
    () => tokenStripCreators.filter((t, i, arr) => arr.findIndex((x) => x.slug === t.slug) === i),
    [tokenStripCreators]
  );

  // Fetch ending soon, featured, sports, and trending markets in parallel on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/markets?status=open&sort=resolving_soon&limit=14").then((r) => r.json()),
      fetch("/api/markets?status=open&sort=trending&limit=12").then((r) => r.json()),
      fetch("/api/markets?category=sports&status=open&sort=newest&limit=4").then((r) => r.json()),
      fetch("/api/markets?status=open&sort=trending&limit=6").then((r) => r.json()),
    ]).then(([endingData, volumeData, sportsData, trendingData]) => {
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const endingSoon = (endingData.data ?? []).filter((m: Market) => {
        if (!m.resolve_at) return false;
        const t = new Date(m.resolve_at).getTime();
        return t > Date.now() && t < sevenDaysFromNow;
      });
      setEndingSoonMarkets(endingSoon.slice(0, 10));

      const allVolume: Market[] = volumeData.data ?? [];
      const withFeatured = allVolume.filter((m: Market) => (m.featured_score ?? 0) > 0);
      if (withFeatured.length >= 6) {
        setFeaturedMarkets(withFeatured.slice(0, 6));
      } else {
        const ids = new Set(withFeatured.map((m: Market) => m.id));
        const fill = allVolume.filter((m: Market) => !ids.has(m.id));
        setFeaturedMarkets([...withFeatured, ...fill].slice(0, 6));
      }

      setSportsMarkets(sportsData.data ?? []);
      setTrendingMarkets(trendingData.data ?? []);
    }).catch(() => {});
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
        const SPECIAL_FILTERS = ["all", "resolving_soon", "breaking", "new", "following", "tokens"];
        const isCreatorFilter = category !== "all" && category !== "resolving_soon" && category !== "breaking" && !CATEGORY_FILTER_SLUGS.includes(category);
        const effectiveSort = category === "resolving_soon" ? "resolving_soon"
          : category === "breaking" ? "breaking"
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
        {/* Hero section */}
        {(heroMarkets.length > 0 || breakingMarkets.length > 0 || trendingCreators.length > 0) && (
          <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
            {heroMarkets.length > 0 && (
              <HeroSection markets={heroMarkets} />
            )}
            <div className="hidden lg:flex flex-col gap-4">
              {breakingMarkets.length > 0 && <BreakingMarkets markets={breakingMarkets} />}
              {uniqueTrendingCreators.length > 0 && (
                <TrendingTokens creators={uniqueTrendingCreators} onBuy={setStakeCreator} />
              )}
            </div>
          </div>
        )}
        {/* TRENDING STRIP — right below hero */}
        <TrendingStrip markets={trendingMarkets} />
      </div>

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

        {/* FEATURED MARKETS */}
        {featuredMarkets.length > 0 && (
          <div className="mb-8">
            <div className="mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">⚡ Featured</h2>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Hand-picked by our AI</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredMarkets.map((market) => {
                const yes = Math.round((market.yes_price ?? 0.5) * 100);
                return (
                  <Link
                    key={market.id}
                    href={`/markets/${market.slug}`}
                    className="flex flex-col rounded-xl p-4 transition-colors"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-orange-400">{market.category}</span>
                      {(market.total_volume ?? 0) > 0 && (
                        <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
                          {formatCompactCurrency(market.total_volume ?? 0)} vol
                        </span>
                      )}
                    </div>
                    <p className="mb-auto line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">{market.title}</p>
                    {market.category_token_slug && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-xs text-orange-400 font-medium">
                          ${market.category_token_slug.replace("caldera-", "").toUpperCase()}
                        </span>
                        <span className="relative group cursor-help text-xs text-muted-foreground">
            · 1% burn 🔥
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-52 -translate-x-1/2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-text-muted shadow-lg group-hover:block">
              1% of this trade permanently reduces the token supply, making remaining tokens scarcer.
            </span>
          </span>
                      </div>
                    )}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-lg font-bold tabular-nums" style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}>{yes}%</span>
                        <span className="text-xs text-[var(--text-tertiary)]">YES</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${yes}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* SPORTS */}
        {sportsMarkets.length > 0 && (
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">🏆 Sports</h2>
              <Link href="/sports" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {sportsMarkets.map((market) => {
                const yes = Math.round((market.yes_price ?? 0.5) * 100);
                return (
                  <Link
                    key={market.id}
                    href={`/markets/${market.slug}`}
                    className="flex flex-col rounded-xl p-4 transition-colors"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-orange-400">{market.category}</div>
                    <p className="mb-auto line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">{market.title}</p>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-lg font-bold tabular-nums" style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}>{yes}%</span>
                        <span className="text-xs text-[var(--text-tertiary)]">YES</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${yes}%` }} />
                      </div>
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
                { value: "all", label: "📈 Trending" },
                { value: "breaking", label: "⚡ Breaking" },
                { value: "new", label: "🕐 New" },
                { value: "following", label: "Following" },
                { value: "tokens", label: "Tokens" },
                { value: "creators", label: "Creators" },
                { value: "politics", label: "Politics" },
                { value: "sports", label: "Sports" },
                { value: "crypto", label: "Crypto" },
                { value: "music", label: "Music" },
                { value: "climate", label: "Climate" },
                { value: "companies", label: "Companies" },
                { value: "tech", label: "Tech" },
                { value: "entertainment", label: "Entertainment" },
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
