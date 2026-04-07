"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { Market } from "@/types";
import { CATEGORIES } from "@/types";
import { formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type HotTopic = { category: string; volume: number; count: number };

type Sort = "volume" | "newest" | "resolving_soon";

type HomeClientProps = {
  featuredMarkets: Market[];
  initialMarkets: Market[];
  hotTopics: HotTopic[];
};

// ─── Featured carousel card ───────────────────────────────────────────────────

function FeaturedCard({ market }: { market: Market }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  return (
    <div
      className="flex w-64 shrink-0 flex-col rounded-2xl p-5 sm:w-72"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]">
        {market.category}
      </div>
      <Link href={`/markets/${market.slug}`} className="flex-1">
        <p className="mb-4 line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
      </Link>
      <div className="mb-3 flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none" style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}>
          {yes}%
        </span>
        <span className="mb-1 text-xs text-[var(--text-tertiary)]">chance</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div className="h-full rounded-full bg-yes" style={{ width: `${yes}%` }} />
      </div>
      <div className="flex gap-2">
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-400 transition-colors active:scale-[0.98]">
            YES {yes}¢
          </button>
        </Link>
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-red-500 hover:bg-red-400 transition-colors active:scale-[0.98]">
            NO {no}¢
          </button>
        </Link>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span className="font-mono">{formatCompactCurrency(market.total_volume ?? 0)} vol</span>
        {market.resolve_at && <span>{formatRelativeTime(market.resolve_at)}</span>}
      </div>
    </div>
  );
}

// ─── Main market card ─────────────────────────────────────────────────────────

function MarketCard({ market }: { market: Market }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const hoursLeft = market.resolve_at
    ? (new Date(market.resolve_at).getTime() - Date.now()) / 3_600_000
    : Infinity;
  const isUrgent = hoursLeft < 24 && hoursLeft > 0;
  const isSoon = hoursLeft >= 24 && hoursLeft < 72;

  return (
    <div
      className="flex flex-col rounded-xl p-4 transition-colors"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
    >
      {/* Category + urgency badge */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          {market.category}
        </span>
        {isUrgent && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            TODAY
          </span>
        )}
        {isSoon && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
            {Math.ceil(hoursLeft / 24)}d left
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={`/markets/${market.slug}`} className="flex-1">
        <p className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
      </Link>

      {/* Probability + bar */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xl font-bold tabular-nums" style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}>
          {yes}%
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">chance</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div className="h-full rounded-full bg-yes" style={{ width: `${yes}%` }} />
      </div>

      {/* YES / NO buttons */}
      <div className="mb-3 flex gap-2">
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
            YES {yes}¢
          </button>
        </Link>
        <Link href={`/markets/${market.slug}`} className="flex-1">
          <button className="w-full rounded-lg py-2 text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors">
            NO {no}¢
          </button>
        </Link>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span className="font-mono">{formatCompactCurrency(market.total_volume ?? 0)} vol</span>
        {market.resolve_at && <span>{formatRelativeTime(market.resolve_at)}</span>}
      </div>
    </div>
  );
}

// ─── Scrolling ticker ─────────────────────────────────────────────────────────

function NewsTicker({ markets }: { markets: Market[] }) {
  if (markets.length === 0) return null;
  const items = [...markets, ...markets]; // duplicate for seamless loop
  return (
    <div
      className="overflow-hidden border-y py-2"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-surface)" }}
    >
      <div className="flex animate-[scroll_40s_linear_infinite] gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
        {items.map((m, i) => (
          <Link
            key={`${m.id}-${i}`}
            href={`/markets/${m.slug}`}
            className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: (m.yes_price ?? 0.5) >= 0.5 ? "var(--yes)" : "var(--no)" }}
            />
            <span>{m.title}</span>
            <span className="font-mono font-bold" style={{ color: (m.yes_price ?? 0.5) >= 0.5 ? "var(--yes)" : "var(--no)" }}>
              {Math.round((m.yes_price ?? 0.5) * 100)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(({ value, label }) => [value, label])
);

export function HomeClient({ featuredMarkets, initialMarkets, hotTopics }: HomeClientProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("volume");
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [offset, setOffset] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(initialMarkets.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMarkets = useCallback(
    async (category: string, sortVal: Sort, off: number, append: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (append) setLoadingMore(true);
      else setFiltering(true);

      try {
        const params = new URLSearchParams({
          sort: sortVal,
          limit: String(PAGE_SIZE),
          offset: String(off),
          status: "open",
        });
        if (category !== "all") params.set("category", category);

        const res = await fetch(`/api/markets?${params}`, { signal: ctrl.signal });
        const json = await res.json();
        const fetched: Market[] = json.data ?? [];

        setMarkets((prev) => (append ? [...prev, ...fetched] : fetched));
        setOffset(off + fetched.length);
        setHasMore(fetched.length === PAGE_SIZE);
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setLoadingMore(false);
        setFiltering(false);
      }
    },
    []
  );

  // Re-fetch when category or sort changes
  useEffect(() => {
    if (activeCategory === "all" && sort === "volume" && offset === PAGE_SIZE) return; // initial render — already have data
    fetchMarkets(activeCategory, sort, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, sort]);

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat);
    setOffset(0);
  };

  const handleSortChange = (s: Sort) => {
    setSort(s);
    setOffset(0);
  };

  const handleShowMore = () => {
    fetchMarkets(activeCategory, sort, offset, true);
  };

  const SORTS: { value: Sort; label: string }[] = [
    { value: "volume", label: "Volume" },
    { value: "newest", label: "Newest" },
    { value: "resolving_soon", label: "Ending Soon" },
  ];

  return (
    <div>
      {/* ── Featured carousel ─────────────────────────────────────────────── */}
      {featuredMarkets.length > 0 && (
        <div
          className="border-b py-6"
          style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated, #0d0d0d)" }}
        >
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                Featured
              </span>
              <Link href="/markets" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
                View all →
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory">
              {featuredMarkets.map((m) => (
                <div key={m.id} className="snap-start">
                  <FeaturedCard market={m} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── News ticker ──────────────────────────────────────────────────── */}
      <NewsTicker markets={featuredMarkets} />

      {/* ── Main layout: sidebar + content ───────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="flex gap-8">

          {/* ── Left sidebar (desktop only) ──────────────────────────────── */}
          <aside className="hidden w-56 shrink-0 lg:block">
            {/* Hot Topics */}
            {hotTopics.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                  Hot Topics
                </h3>
                <div className="space-y-2">
                  {hotTopics.map((t) => (
                    <button
                      key={t.category}
                      onClick={() => handleCategoryClick(t.category)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bg-surface)]"
                      style={activeCategory === t.category ? { background: "var(--bg-surface)", color: "var(--accent)" } : {}}
                    >
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {CATEGORY_LABEL[t.category] ?? t.category}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                        {formatCompactCurrency(t.volume)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Explore / category filter */}
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                Explore
              </h3>
              <div className="space-y-1">
                {[{ value: "all", label: "🌐 All Markets" }, ...CATEGORIES].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleCategoryClick(value)}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors"
                    style={
                      activeCategory === value
                        ? { background: "var(--caldera-muted, #f9731615)", color: "var(--accent)" }
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Right main content ────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            {/* Mobile category pills */}
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {[{ value: "all", label: "All" }, ...CATEGORIES].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleCategoryClick(value)}
                  className="shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition-all"
                  style={
                    activeCategory === value
                      ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--caldera-muted, #f9731615)" }
                      : { borderColor: "var(--border-subtle)", color: "var(--text-secondary)", background: "transparent" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sort bar */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-[var(--text-tertiary)]">
                {activeCategory === "all" ? "All Markets" : (CATEGORY_LABEL[activeCategory] ?? activeCategory)}
              </p>
              <div className="flex gap-1">
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleSortChange(s.value)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    style={
                      sort === s.value
                        ? { background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                        : { color: "var(--text-tertiary)", border: "1px solid transparent" }
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Market grid */}
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 transition-opacity ${filtering ? "opacity-40" : "opacity-100"}`}>
              {markets.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>

            {markets.length === 0 && !filtering && (
              <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">
                No markets found
              </p>
            )}

            {/* Show more */}
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleShowMore}
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
        </div>
      </div>
    </div>
  );
}
