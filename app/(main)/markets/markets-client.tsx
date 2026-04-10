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

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolving", label: "Resolving" },
  { value: "resolved", label: "Resolved" },
];

type MarketsClientProps = {
  markets: Market[];
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

export function MarketsClient({ markets }: MarketsClientProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
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
      const expandedCats = new Set<string>();
      const CAT_GROUPS: Record<string, string[]> = {
        creators: ["creators", "streamers"],
        entertainment: ["entertainment", "viral"],
        tech: ["tech", "crypto"],
        sports: ["sports", "athletes"],
        commentary: ["commentary", "Commentary"],
      };
      selectedCategories.forEach((c) => {
        const group = CAT_GROUPS[c] || [c];
        group.forEach((g) => expandedCats.add(g));
      });
      result = result.filter((m) => expandedCats.has(m.category));
    }

    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
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
  }, [markets, selectedCategories, statusFilter, sortBy]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text-primary)]">
        Markets
      </h1>

      {/* Mobile: horizontal filter bar */}
      <div className="mb-6 lg:hidden">
        <div className="overflow-x-auto scrollbar-hide pb-2">
          <div className="flex gap-2">
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
            <div
              className="shrink-0 self-center mx-2 h-4 w-px"
              style={{ background: "var(--border-default)" }}
            />
            {SORT_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                active={sortBy === opt.value}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Desktop sidebar filters */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 space-y-6">
            {/* Categories */}
            <div>
              <h3
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)" }}
              >
                Category
              </h3>
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={selectedCategories.size === 0}
                  onClick={() => setSelectedCategories(new Set())}
                >
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
            </div>

            {/* Status */}
            <div>
              <h3
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)" }}
              >
                Status
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <Pill
                    key={opt.value}
                    active={statusFilter === opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                  >
                    {opt.label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <h3
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)" }}
              >
                Sort By
              </h3>
              <div className="flex flex-col gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors min-h-[44px]",
                      sortBy === opt.value
                        ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                    )}
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
          <p className="mb-4 text-sm text-[var(--text-tertiary)]">
            {filtered.length} market{filtered.length !== 1 ? "s" : ""}
          </p>
          <MarketGrid markets={filtered} />
        </div>
      </div>
    </div>
  );
}
