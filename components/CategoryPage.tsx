"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Market } from "@/types";
import { formatCompactCurrency, formatRelativeTime, cn } from "@/lib/utils";
import { Search } from "lucide-react";

type CategoryPageProps = {
  category: string;
  title: string;
  icon: string;
  description: string;
};

const PAGE_SIZE = 30;

export default function CategoryPage({ category, title, icon, description }: CategoryPageProps) {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState("All");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/markets?category=${encodeURIComponent(category)}&limit=50&sort=volume`)
      .then((r) => r.json())
      .then(({ data }) => {
        setMarkets(Array.isArray(data) ? data : []);
      })
      .catch(() => setMarkets([]))
      .finally(() => setLoading(false));
  }, [category]);

  // Derive sub-categories from markets
  const subCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of markets) {
      const sub = m.subcategory || "General";
      counts[sub] = (counts[sub] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [markets]);

  const filtered = useMemo(() => {
    let result = markets;
    if (subFilter !== "All") {
      result = result.filter((m) => (m.subcategory || "General") === subFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.title.toLowerCase().includes(q));
    }
    return result;
  }, [markets, subFilter, search]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-text-primary">
          {icon} {title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      </div>

      <div className="flex gap-6">
        {/* ── Left sidebar: sub-category filter ── */}
        {subCategories.length > 0 && (
          <aside className="hidden w-48 shrink-0 md:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
              Filter
            </p>
            <ul className="space-y-0.5">
              {[{ name: "All", count: markets.length }, ...subCategories].map(({ name, count }) => (
                <li key={name}>
                  <button
                    onClick={() => { setSubFilter(name); setPage(1); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                      subFilter === name
                        ? "bg-caldera/10 font-semibold text-caldera"
                        : "text-text-muted hover:bg-surface hover:text-text-primary"
                    )}
                  >
                    <span className="truncate">{name}</span>
                    <span className="ml-2 text-xs text-text-faint">{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* ── Main content ── */}
        <div className="min-w-0 flex-1">
          {/* Search bar */}
          <div className="relative mb-5 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={`Search ${title.toLowerCase()} markets…`}
              className="w-full rounded-xl border border-border-subtle bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
            />
          </div>

          {/* Mobile sub-filter chips */}
          {subCategories.length > 0 && (
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide md:hidden">
              {[{ name: "All", count: markets.length }, ...subCategories].map(({ name }) => (
                <button
                  key={name}
                  onClick={() => { setSubFilter(name); setPage(1); }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    subFilter === name
                      ? "bg-caldera text-white"
                      : "border border-border-subtle text-text-muted hover:text-text-primary"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-xl border border-border-subtle bg-surface"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="py-20 text-center text-sm text-text-muted">
              {search ? "No markets match your search." : `No ${title.toLowerCase()} markets open right now.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((market) => (
                <MarketCard key={market.id} market={market} onTrade={(slug, side) => router.push(`/markets/${slug}?side=${side}`)} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-border-subtle bg-surface px-6 py-2.5 text-sm font-medium text-text-muted transition-colors hover:border-caldera/40 hover:text-text-primary"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Market card ──────────────────────────────────────────────────────────────

function MarketCard({ market, onTrade }: { market: Market; onTrade: (slug: string, side: "yes" | "no") => void }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const vol = market.total_volume ?? 0;

  return (
    <div
      className="group flex flex-col rounded-xl border border-border-subtle bg-surface p-4 transition-all duration-150 hover:border-caldera/30 hover:-translate-y-px hover:shadow-lg hover:shadow-black/20"
    >
      {/* Category badge */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-caldera/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-caldera">
          {market.subcategory || market.category}
        </span>
        {market.resolve_at && (
          <span className="ml-auto text-[10px] text-text-faint">
            {formatRelativeTime(market.resolve_at)}
          </span>
        )}
      </div>

      {/* Title — links to market */}
      <Link href={`/markets/${market.slug}`} className="mb-auto">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary group-hover:text-white">
          {market.title}
        </p>
      </Link>

      {/* Creator tag */}
      {market.creator_slug && (
        <p className="mt-1 text-xs text-caldera">${market.creator_slug}</p>
      )}

      {/* Probability bar */}
      <div className="mt-3 mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span
            className="font-mono text-base font-bold tabular-nums"
            style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
          >
            {yes}%
          </span>
          <span className="font-mono text-xs text-text-faint">{no}% NO</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${yes}%`,
              background: yes >= 50 ? "var(--yes)" : "var(--no)",
            }}
          />
        </div>
      </div>

      {/* Volume + YES/NO buttons */}
      <div className="flex items-center gap-2">
        {vol > 0 && (
          <span className="mr-auto font-mono text-xs text-text-faint">
            {formatCompactCurrency(vol)} vol
          </span>
        )}
        <button
          onClick={() => onTrade(market.slug, "yes")}
          className="rounded-lg bg-yes/10 px-3 py-1 text-xs font-semibold text-yes transition-colors hover:bg-yes hover:text-white"
        >
          YES
        </button>
        <button
          onClick={() => onTrade(market.slug, "no")}
          className="rounded-lg bg-no/10 px-3 py-1 text-xs font-semibold text-no transition-colors hover:bg-no hover:text-white"
        >
          NO
        </button>
      </div>
    </div>
  );
}
