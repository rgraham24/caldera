"use client";

import { useState, useMemo } from "react";
import type { Market, Category } from "@/types";
import { CATEGORIES } from "@/types";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { CategoryPill } from "@/components/shared/CategoryPill";

type SortOption = "trending" | "volume" | "newest" | "resolving_soon";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "volume", label: "Volume" },
  { value: "newest", label: "Newest" },
  { value: "resolving_soon", label: "Resolving Soon" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolving", label: "Resolving" },
  { value: "resolved", label: "Resolved" },
];

type MarketsClientProps = {
  markets: Market[];
};

export function MarketsClient({ markets }: MarketsClientProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [statusFilter, setStatusFilter] = useState("all");
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
      result = result.filter((m) => selectedCategories.has(m.category));
    }

    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
    }

    switch (sortBy) {
      case "trending":
        result.sort((a, b) => b.trending_score - a.trending_score);
        break;
      case "volume":
        result.sort((a, b) => b.total_volume - a.total_volume);
        break;
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        break;
      case "resolving_soon":
        result.sort((a, b) => {
          if (!a.resolve_at) return 1;
          if (!b.resolve_at) return -1;
          return (
            new Date(a.resolve_at).getTime() -
            new Date(b.resolve_at).getTime()
          );
        });
        break;
    }

    return result;
  }, [markets, selectedCategories, statusFilter, sortBy]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        Markets
      </h1>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar filters */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="sticky top-20 space-y-6">
            {/* Categories */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Category
              </h3>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <CategoryPill
                    key={cat.value}
                    category={cat.label}
                    active={selectedCategories.has(cat.value)}
                    onClick={() => toggleCategory(cat.value)}
                  />
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Status
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === opt.value
                        ? "bg-caldera/10 text-caldera border border-caldera/20"
                        : "bg-surface border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Sort By
              </h3>
              <div className="flex flex-col gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      sortBy === opt.value
                        ? "bg-surface-2 text-text-primary font-medium"
                        : "text-text-muted hover:bg-surface hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main grid */}
        <div className="flex-1">
          <div className="mb-4 text-sm text-text-muted">
            {filtered.length} market{filtered.length !== 1 ? "s" : ""}
          </div>
          <MarketGrid markets={filtered} />
        </div>
      </div>
    </div>
  );
}
