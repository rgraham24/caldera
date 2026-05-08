"use client";

import { useState, useMemo } from "react";
import type { Market } from "@/types";
import { CATEGORIES } from "@/types";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { cn } from "@/lib/utils";

type SortOption = "trending" | "volume" | "newest" | "resolving_soon";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "volume", label: "Volume" },
  { value: "newest", label: "Newest" },
  { value: "resolving_soon", label: "Resolving Soon" },
];

type MarketsClientProps = {
  markets: Market[];
  totalCount: number;
};

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

export function MarketsClient({ markets, totalCount }: MarketsClientProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("trending");

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = [...markets];

    if (selectedCategories.size > 0) {
      const expandedCats = new Set<string>();
      const CAT_GROUPS: Record<string, string[]> = {
        creators: ["creators", "streamers"],
        entertainment: ["entertainment", "viral"],
        sports: ["sports", "athletes"],
      };
      selectedCategories.forEach((c) => {
        const group = CAT_GROUPS[c] || [c];
        group.forEach((g) => expandedCats.add(g));
      });
      result = result.filter((m) => expandedCats.has(m.category));
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
  }, [markets, selectedCategories, sortBy]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Markets</h1>
        <span className="text-sm text-[var(--text-tertiary)]">
          {selectedCategories.size === 0
            ? <>{totalCount.toLocaleString()} markets</>
            : <>{filtered.length} market{filtered.length !== 1 ? "s" : ""}</>
          }
        </span>
      </div>

      {/* Top filter row: horizontal scrollable pills + sort dropdown right */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 flex-1 min-w-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          <Pill active={selectedCategories.size === 0} onClick={() => setSelectedCategories(new Set())}>
            All
          </Pill>
          {CATEGORIES.map((cat) => (
            <Pill
              key={cat.value}
              active={selectedCategories.has(cat.value)}
              onClick={() => toggleCategory(cat.value)}
            >
              {cat.label}
            </Pill>
          ))}
        </div>

        <div className="shrink-0">
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

      <MarketGrid markets={filtered} />
    </div>
  );
}
