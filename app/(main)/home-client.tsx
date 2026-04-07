"use client";

import Link from "next/link";
import type { Market } from "@/types";
import { CATEGORIES } from "@/types";
import { formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

type HomeClientProps = {
  heroMarkets: Market[];
  trendingMarkets: Market[];
  categoryMarkets: Record<string, Market[]>;
};

// ─── Inline market card used throughout this page ─────────────────────────────

function HomepageMarketCard({ market }: { market: Market }) {
  const yesPercent = Math.round((market.yes_price ?? 0.5) * 100);
  const noPercent = 100 - yesPercent;
  const resolve = market.resolve_at ? formatRelativeTime(market.resolve_at) : null;

  return (
    <div
      className="flex flex-col rounded-xl p-4 transition-colors"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
    >
      {/* Meta row */}
      <div className="mb-2 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
        <span>{market.category}</span>
        {resolve && <><span>·</span><span>{resolve}</span></>}
        <span className="ml-auto font-mono normal-case">
          {formatCompactCurrency(market.total_volume ?? 0)} vol
        </span>
      </div>

      {/* Title */}
      <Link href={`/markets/${market.slug}`} className="flex-1">
        <p className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
      </Link>

      {/* YES / NO buttons */}
      <div className="flex gap-2">
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
            YES {yesPercent}¢
          </button>
        </Link>
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors">
            NO {noPercent}¢
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─── Hero carousel card ───────────────────────────────────────────────────────

function HeroMarketCard({ market }: { market: Market }) {
  const yesPercent = Math.round((market.yes_price ?? 0.5) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-xl p-5 sm:w-80"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      {/* Category + volume */}
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <span>{market.category}</span>
        <span>·</span>
        <span className="font-mono normal-case">{formatCompactCurrency(market.total_volume ?? 0)} vol</span>
        {market.resolve_at && (
          <><span>·</span><span>{formatRelativeTime(market.resolve_at)}</span></>
        )}
      </div>

      {/* Title */}
      <Link href={`/markets/${market.slug}`} className="flex-1">
        <p className="mb-4 line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
      </Link>

      {/* Probability */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-3xl font-bold tabular-nums text-yes">{yesPercent}%</span>
        <div className="h-8 w-px" style={{ background: "var(--border-default)" }} />
        <span className="text-lg font-semibold tabular-nums text-[var(--text-tertiary)]">{noPercent}%</span>
        <span className="ml-1 text-xs text-[var(--text-tertiary)]">chance</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div className="h-full rounded-full bg-yes transition-all" style={{ width: `${yesPercent}%` }} />
      </div>

      {/* Trade buttons */}
      <div className="flex gap-2">
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-3 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]">
            YES {yesPercent}¢
          </button>
        </Link>
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]">
            NO {noPercent}¢
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HomeClient({ heroMarkets, trendingMarkets, categoryMarkets }: HomeClientProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-12">

      {/* ── 1. HERO CAROUSEL ──────────────────────────────────────────────── */}
      {heroMarkets.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Featured
            </h2>
            <Link
              href="/markets"
              className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
            {heroMarkets.map((m) => (
              <div key={m.id} className="snap-start">
                <HeroMarketCard market={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 2. TRENDING NOW ───────────────────────────────────────────────── */}
      {trendingMarkets.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Trending Now
            </h2>
            <Link
              href="/markets?sort=trending"
              className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trendingMarkets.map((m) => (
              <HomepageMarketCard key={m.id} market={m} />
            ))}
          </div>
        </section>
      )}

      {/* ── 3. CATEGORY ROWS ──────────────────────────────────────────────── */}
      {CATEGORIES.map(({ value, label }) => {
        const markets = categoryMarkets[value] ?? [];
        if (markets.length === 0) return null;
        return (
          <section key={value}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                {label}
              </h2>
              <Link
                href={`/markets?category=${value}`}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {markets.map((m) => (
                <HomepageMarketCard key={m.id} market={m} />
              ))}
            </div>
          </section>
        );
      })}

    </div>
  );
}
