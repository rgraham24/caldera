"use client";

import { useState, useMemo, useEffect } from "react";
import type { Market } from "@/types";
import { CATEGORIES } from "@/types";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { cn } from "@/lib/utils";

type SortOption = "trending" | "volume" | "newest" | "resolving_soon";

const BATCH_SIZE = 24;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "volume", label: "Volume" },
  { value: "newest", label: "Newest" },
  { value: "resolving_soon", label: "Resolving Soon" },
];

type MarketsClientProps = {
  markets: Market[];
  totalCount: number;
  // Seeded from the URL (?category, ?sort) by the server page so topic
  // tiles + browse pills land pre-filtered. Optional — direct visits to
  // /markets get the defaults below.
  initialCategory?: string | null;
  initialSort?: string;
};

const KNOWN_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.value));

// Map the URL ?sort token to an internal SortOption. The browse pills use
// "ending" for the resolving-soon sort; everything unknown falls through
// to the default "trending".
function resolveSort(sort: string | undefined): SortOption {
  switch (sort) {
    case "volume":
      return "volume";
    case "ending":
      return "resolving_soon";
    case "newest":
      return "newest";
    case "trending":
      return "trending";
    default:
      return "trending";
  }
}

// Accept a URL category only if it's a known pill value (lowercased).
// Anything unknown is ignored so we never seed an empty/stuck filter.
function resolveCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  const normalized = category.toLowerCase();
  return KNOWN_CATEGORIES.has(normalized) ? normalized : null;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all whitespace-nowrap min-h-[36px]",
        active
          ? "text-[var(--text-primary)] bg-[var(--bg-elevated)] border-[var(--border-default)]"
          : "text-[var(--text-secondary)] bg-transparent border-transparent hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

// Category aliases — kept at module scope so the useMemo dep tracking
// stays minimal. Each pill maps to its own DB category EXCEPT for the
// two historical aliases where the UI category subsumes a separate DB
// label that's never had its own pill.
const CAT_GROUPS: Record<string, string[]> = {
  creators: ["creators", "streamers"],
  sports: ["sports", "athletes"],
};

export function MarketsClient({
  markets,
  totalCount,
  initialCategory,
  initialSort,
}: MarketsClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    resolveCategory(initialCategory)
  );
  const [sortBy, setSortBy] = useState<SortOption>(resolveSort(initialSort));
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Reset to first page whenever the user changes filter or sort —
  // otherwise they'd land on whatever scroll-page was visible when the
  // change happened, which is rarely what they want.
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [selectedCategory, sortBy]);

  // Single-select: clicking a pill replaces the active filter; clicking
  // the same pill again clears it back to "All". Multi-select union was
  // confusing — every prediction-market competitor (Polymarket, Kalshi,
  // Manifold) uses single-select for the same reason.
  const selectCategory = (cat: string) => {
    setSelectedCategory((current) => (current === cat ? null : cat));
  };

  const filtered = useMemo(() => {
    let result = [...markets];

    if (selectedCategory) {
      // CATEGORIES values are lowercase by convention; markets.category
      // is stored Title Case in the DB ("Sports", "Entertainment", ...).
      // Normalize via toLowerCase() so the filter matches without
      // mutating the DB. Aliases (creators ↔ streamers, sports ↔
      // athletes) expand only for the active category.
      const aliases = CAT_GROUPS[selectedCategory] ?? [selectedCategory];
      const aliasSet = new Set(aliases);
      result = result.filter((m) =>
        m.category ? aliasSet.has(m.category.toLowerCase()) : false
      );
    }

    switch (sortBy) {
      case "trending":
        result.sort((a, b) => (b.trending_score ?? 0) - (a.trending_score ?? 0));
        break;
      case "volume":
        result.sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0));
        break;
      case "newest":
        result.sort((a, b) => new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime());
        break;
      case "resolving_soon":
        result.sort((a, b) => {
          if (!a.resolve_at) return 1;
          if (!b.resolve_at) return -1;
          return new Date(a.resolve_at).getTime() - new Date(b.resolve_at).getTime();
        });
        break;
    }

    return result;
  }, [markets, selectedCategory, sortBy]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Markets</h1>
        <span className="text-sm text-[var(--text-tertiary)]">
          {selectedCategory === null
            ? <>{totalCount.toLocaleString()} markets</>
            : <>{filtered.length} market{filtered.length !== 1 ? "s" : ""}</>
          }
        </span>
      </div>

      {/* Top filter row: on mobile the sort control sits on its own row so
          the category pills get a full-width, edge-to-edge scroll track with
          nothing overlapping them. On md+ it stays inline to the right. */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 flex-1 min-w-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          <Pill active={selectedCategory === null} onClick={() => setSelectedCategory(null)}>
            All
          </Pill>
          {CATEGORIES.map((cat) => (
            <Pill
              key={cat.value}
              active={selectedCategory === cat.value}
              onClick={() => selectCategory(cat.value)}
            >
              {cat.label}
            </Pill>
          ))}
        </div>

        <div className="shrink-0 self-end md:self-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40 focus:border-[var(--accent)] focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MarketGrid markets={filtered.slice(0, visibleCount)} />

      {visibleCount < filtered.length && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + BATCH_SIZE)}
            className="w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          >
            Show more ({Math.min(visibleCount, filtered.length)} of {filtered.length})
          </button>
        </div>
      )}
    </div>
  );
}
