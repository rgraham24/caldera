"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Creator } from "@/types";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { StakeModal } from "@/components/markets/StakeModal";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { useLivePrices } from "@/hooks/useLivePrices";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "creators", label: "🎬 Creators" },
  { value: "music", label: "🎵 Music" },
  { value: "sports", label: "⚽ Sports" },
  { value: "tech", label: "💻 Tech" },
  { value: "politics", label: "👑 Politics" },
  { value: "entertainment", label: "🎭 Entertainment" },
];

const SORTS = [
  { value: "price", label: "Token Price" },
  { value: "holders", label: "Holders" },
  { value: "markets", label: "Markets" },
  { value: "newest", label: "Newest" },
];

export default function TokensPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [categoryTokens, setCategoryTokens] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("price");
  const [search, setSearch] = useState("");
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const { isConnected } = useAppStore();
  const { prices: livePrices, lastUpdated } = useLivePrices();

  useEffect(() => {
    setLoading(true);
    fetch("/api/creators/list")
      .then((r) => r.json())
      .then(({ data }) => {
        const all: Creator[] = Array.isArray(data) ? data : [];
        setCategoryTokens(all.filter((c) => (c as any).entity_type === 'category'));
        setCreators(all.filter((c) => (c as any).entity_type !== 'category'));
      })
      .catch(() => setCreators([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = [...creators];
    if (catFilter !== "all") {
      if (catFilter === "sports") {
        result = result.filter((c) => c.category === "sports" || c.sport);
      } else if (catFilter === "creators") {
        result = result.filter((c) =>
          ["creators", "streamers", "esports", "media"].includes(c.category || "")
        );
      } else if (catFilter === "entertainment") {
        result = result.filter((c) =>
          ["entertainment", "viral"].includes(c.category || "")
        );
      } else {
        result = result.filter((c) => c.category === catFilter);
      }
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.creator_coin_symbol?.toLowerCase().includes(q) ||
          c.deso_username?.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case "price":
        result.sort((a, b) => (b.creator_coin_price ?? 0) - (a.creator_coin_price ?? 0));
        break;
      case "holders":
        result.sort((a, b) => (b.creator_coin_holders ?? 0) - (a.creator_coin_holders ?? 0));
        break;
      case "markets":
        result.sort((a, b) => (b.markets_count ?? 0) - (a.markets_count ?? 0));
        break;
      case "newest":
        result.sort(
          (a, b) => new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime()
        );
        break;
    }
    return result;
  }, [creators, catFilter, sortBy, search]);

  const handleBuy = (c: Creator) => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }
    setStakeCreator(c);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-text-primary">💰 Tokens</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yes" />
          Live on DeSo
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tokens…"
            className="w-full rounded-xl border border-border-subtle bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCatFilter(c.value)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                catFilter === c.value
                  ? "bg-caldera/10 text-caldera"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-muted"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Buy & Burn Category Tokens */}
      {!loading && categoryTokens.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
            Buy &amp; Burn Tokens
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categoryTokens.map((t) => (
              <Link key={t.slug} href={`/creators/${t.slug}`} className="rounded-xl border border-border-subtle bg-surface p-4 transition-all hover:border-caldera/30 hover:-translate-y-px">
                <div className="text-base font-bold text-text-primary">
                  ${t.name.toUpperCase()}
                </div>
                <div className="text-xs text-text-muted mt-1 leading-relaxed">
                  1% of all {t.name.toLowerCase()} markets burned 🔥
                </div>
                <div className="text-xs text-caldera mt-2 font-medium">
                  {t.markets_count || 0} markets
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border-subtle bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-20 text-center text-sm text-text-muted">No tokens found.</p>
      ) : (
        <>
          {/* Header row */}
          <div className="mb-1 grid grid-cols-[1fr_80px_80px_100px_80px_80px] items-center gap-4 px-4 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
            <span>Token</span>
            <span className="hidden text-right sm:block">Price</span>
            <span className="hidden text-right sm:block">Holders</span>
            <span className="hidden text-right sm:block">Mkt Cap</span>
            <span className="hidden text-right sm:block">Markets</span>
            <span />
          </div>
          <div className="space-y-2">
            {filtered.map((c, i) => {
              const sym = c.deso_username || c.creator_coin_symbol;
              const hasToken = !!c.deso_username;

              // Merge live SSE prices over static DB values
              const live = livePrices.get(c.slug);
              const displayPrice = live?.creator_coin_price ?? c.creator_coin_price ?? 0;
              const displayHolders = live?.creator_coin_holders ?? c.creator_coin_holders ?? 0;
              const rawMcap = live?.creator_coin_market_cap ?? c.creator_coin_market_cap ?? 0;
              const displayMcap = rawMcap > 0
                ? rawMcap
                : displayPrice * Math.sqrt(displayHolders || 1) * 1000;

              const updatedAt = lastUpdated.get(c.slug);
              const isFlashing = !!updatedAt && Date.now() - updatedAt < 1000;

              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_80px_80px_100px_80px_80px] items-center gap-4 rounded-xl border border-border-subtle bg-surface px-4 py-3 transition-all hover:border-white/20"
                >
                  {/* Creator info */}
                  <Link href={`/creators/${c.slug}`} className="flex min-w-0 items-center gap-3">
                    <CreatorAvatar creator={c} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {c.category === "Crypto" ? `${c.name} Markets` : c.name}
                        </p>
                        <VerificationBadge
                          isReserved={c.deso_is_reserved ?? false}
                          isCalderaVerified={c.is_caldera_verified ?? false}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] tracking-widest text-text-muted">${sym}</span>
                        {c.league && (
                          <span className="rounded-full bg-caldera/10 px-1 py-0.5 text-[9px] font-semibold text-caldera">
                            {c.league}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Price — flashes green on live update */}
                  <span
                    className={cn(
                      "hidden text-right font-mono text-sm font-semibold transition-colors duration-500 sm:block",
                      isFlashing ? "text-yes" : "text-text-primary"
                    )}
                  >
                    {hasToken && displayPrice > 0.01 ? formatCurrency(displayPrice) : "—"}
                  </span>

                  {/* Holders */}
                  <span className="hidden text-right font-mono text-sm text-text-muted sm:block">
                    {displayHolders.toLocaleString()}
                  </span>

                  {/* Mkt cap */}
                  <span className="hidden text-right font-mono text-sm text-text-muted sm:block">
                    {displayMcap > 0 ? formatCompactCurrency(displayMcap) : "—"}
                  </span>

                  {/* Markets */}
                  <span className="hidden items-center justify-end gap-1 font-mono text-sm text-text-muted sm:flex">
                    {(c.markets_count ?? 0) > 0 ? (c.markets_count ?? 0) : "—"}
                    {(c.markets_count ?? 0) > 0 && !c.deso_is_reserved && !c.is_caldera_verified && (
                      <span
                        title="Unverified — handle may be squatted. Creator can claim this market."
                        className="text-[11px] text-orange-400 cursor-help"
                      >⚠</span>
                    )}
                  </span>

                  {/* Buy button */}
                  <button
                    onClick={() => handleBuy(c)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    Buy
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {stakeCreator && (
        <StakeModal
          creator={stakeCreator}
          isOpen={!!stakeCreator}
          onClose={() => setStakeCreator(null)}
          desoUsername={stakeCreator.deso_username}
          livePrice={stakeCreator.creator_coin_price ?? undefined}
        />
      )}
    </div>
  );
}
