"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import type { Creator } from "@/types";
import { CATEGORIES } from "@/types";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { FollowButton } from "@/components/shared/FollowButton";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

const StakeModal = dynamic(
  () => import("@/components/markets/StakeModal").then((m) => ({ default: m.StakeModal })),
  { ssr: false }
);

type SortKey = "market_cap" | "volume" | "holders" | "price" | "newest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "market_cap", label: "Market Cap" },
  { value: "volume", label: "Volume" },
  { value: "holders", label: "Holders" },
  { value: "price", label: "Price" },
  { value: "newest", label: "Newest" },
];

const SEARCH_DEBOUNCE_MS = 300;

type CreatorsClientProps = {
  initialCreators: Creator[];
  initialTotal: number;
  pageSize: number;
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

function creatorMarketCap(c: Creator): number {
  if ((c.creator_coin_market_cap ?? 0) > 0) return c.creator_coin_market_cap ?? 0;
  // Fallback estimate when DB hasn't computed market cap yet.
  return (c.creator_coin_price ?? 0) * Math.sqrt(c.creator_coin_holders || 1) * 1000;
}

export function CreatorsClient({
  initialCreators,
  initialTotal,
  pageSize,
}: CreatorsClientProps) {
  const [creators, setCreators] = useState<Creator[]>(initialCreators);
  const [total, setTotal] = useState<number>(initialTotal);
  const [hasMore, setHasMore] = useState<boolean>(initialCreators.length < initialTotal);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("market_cap");

  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const isConnected = useAppStore((s) => s.isConnected);

  // 300ms debounce on the search input so we don't hammer the API on
  // every keystroke. The selectedCategory and sort don't need debouncing
  // (they fire on user click, not per-character).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Tracks the in-flight load() so a fast filter change cancels the
  // stale fetch instead of clobbering newer state. Each load() captures
  // its own controller in the ref slot — the cleanup aborts whichever
  // is current when deps change.
  const abortRef = useRef<AbortController | null>(null);

  const buildQuery = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        sort,
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (selectedCategory) params.set("category", selectedCategory);
      return params.toString();
    },
    [pageSize, sort, debouncedSearch, selectedCategory]
  );

  // Replace creators with a fresh first page whenever filters change.
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(`/api/creators/list?${buildQuery(0)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json: { data?: Creator[]; total?: number; hasMore?: boolean }) => {
        setCreators((json.data as Creator[] | undefined) ?? []);
        setTotal(json.total ?? 0);
        setHasMore(Boolean(json.hasMore));
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[creators] list fetch failed:", err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [buildQuery]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/creators/list?${buildQuery(creators.length)}`);
      const json = (await res.json()) as {
        data?: Creator[];
        total?: number;
        hasMore?: boolean;
      };
      const next = (json.data as Creator[] | undefined) ?? [];
      const seen = new Set(creators.map((c) => c.id));
      const fresh = next.filter((c) => !seen.has(c.id));
      setCreators((prev) => [...prev, ...fresh]);
      setHasMore(Boolean(json.hasMore));
      if (typeof json.total === "number") setTotal(json.total);
    } catch (err) {
      console.error("[creators] loadMore failed:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleBuyClick = (c: Creator) => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }
    setStakeCreator(c);
  };

  const isFiltered = useMemo(
    () => Boolean(debouncedSearch) || selectedCategory !== null,
    [debouncedSearch, selectedCategory]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-4 text-2xl font-semibold text-[var(--text-primary)]">
        Creators
      </h1>

      {/* Search + sort row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search creators…"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] py-2 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40 focus:border-[var(--accent)] focus:outline-none cursor-pointer"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category pills */}
      <div
        className="mb-6 flex gap-2 overflow-x-auto scrollbar-hide pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        <Pill active={selectedCategory === null} onClick={() => setSelectedCategory(null)}>
          All
        </Pill>
        {CATEGORIES.map((cat) => (
          <Pill
            key={cat.value}
            active={selectedCategory === cat.value}
            onClick={() =>
              setSelectedCategory((current) => (current === cat.value ? null : cat.value))
            }
          >
            {cat.label}
          </Pill>
        ))}
      </div>

      {/* Grid */}
      {loading && creators.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(pageSize)].map((_, i) => (
            <div
              key={i}
              className="h-[220px] rounded-2xl bg-[var(--bg-surface)] animate-pulse"
            />
          ))}
        </div>
      ) : creators.length === 0 ? (
        <div className="text-center py-20 text-sm text-[var(--text-tertiary)]">
          {isFiltered
            ? "No creators match your filters."
            : "No creators found."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => {
              const sym = c.creator_coin_symbol || c.deso_username || c.slug;
              const hasToken = Boolean(c.deso_username);
              const price = c.creator_coin_price ?? 0;
              const mktCap = creatorMarketCap(c);
              const holders = c.creator_coin_holders ?? 0;
              const weeklyVol = c.weekly_volume_usd ?? 0;
              const isVerified =
                c.is_bitclout_original === true ||
                c.verification_status === "approved";

              return (
                <div
                  key={c.id}
                  className="flex flex-col rounded-2xl border border-[var(--border-subtle)]/40 bg-[var(--bg-surface)] p-5 transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5"
                >
                  <Link href={`/creators/${c.slug}`} className="flex-1">
                    {/* Header: avatar + name + badge */}
                    <div className="mb-3 flex items-center gap-3">
                      <CreatorAvatar creator={c} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                            {c.name}
                          </p>
                          {isVerified && (
                            <span
                              className="text-[var(--accent)] text-xs"
                              title="Verified"
                              aria-label="Verified"
                            >
                              ✓
                            </span>
                          )}
                          {c.league && (
                            <span className="rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                              {c.league}
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                          ${sym}
                        </p>
                      </div>
                    </div>

                    {/* Big price */}
                    <div className="mb-3">
                      <span className="font-display text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                        {hasToken && price > 0.01
                          ? formatCurrency(price)
                          : hasToken
                          ? "—"
                          : "—"}
                      </span>
                    </div>

                    {/* Metric row: market cap · holders · volume */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-[var(--text-tertiary)]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide opacity-70">Mkt Cap</div>
                        <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                          {mktCap > 0 ? formatCompactCurrency(mktCap) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide opacity-70">Holders</div>
                        <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                          {holders > 0 ? holders.toLocaleString() : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide opacity-70">7d Vol</div>
                        <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                          {weeklyVol > 0 ? formatCompactCurrency(weeklyVol) : "—"}
                        </div>
                      </div>
                    </div>

                    {(c.markets_count ?? 0) > 0 && (
                      <div className="mt-3 text-xs text-[var(--text-tertiary)]">
                        {c.markets_count} market{c.markets_count === 1 ? "" : "s"}
                      </div>
                    )}
                  </Link>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <FollowButton creatorDesoPublicKey={c.deso_public_key} className="flex-none" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuyClick(c);
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#7C5CFC] hover:bg-[#6a4ae8] text-white shadow-md shadow-[#7C5CFC]/20 transition-all duration-150 active:scale-[0.98] border border-[#7C5CFC]/20"
                    >
                      Buy ${sym}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </>
      )}

      {stakeCreator && (
        <StakeModal
          creator={stakeCreator}
          isOpen={!!stakeCreator}
          onClose={() => setStakeCreator(null)}
          desoUsername={stakeCreator.deso_username}
        />
      )}
    </div>
  );
}
