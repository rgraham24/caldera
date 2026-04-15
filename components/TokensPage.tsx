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
  const [categoryMarketCounts, setCategoryMarketCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("price");
  const [search, setSearch] = useState("");
  const [stakeCreator, setStakeCreator] = useState<Creator | null>(null);
  const [defaultTab, setDefaultTab] = useState<"buy" | "sell">("buy");
  const { isConnected } = useAppStore();
  const { prices: livePrices, lastUpdated } = useLivePrices();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/creators/list").then((r) => r.json()),
      fetch("/api/markets/category-counts").then((r) => r.json()),
    ])
      .then(([creatorsRes, countsRes]) => {
        const all: Creator[] = Array.isArray(creatorsRes.data) ? creatorsRes.data : [];
        setCategoryTokens(all.filter((c) => c.entity_type === 'category'));
        setCreators(all.filter((c) => c.entity_type !== 'category'));
        if (countsRes.data && typeof countsRes.data === "object") {
          setCategoryMarketCounts(countsRes.data as Record<string, number>);
        }
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
        <p className="mt-1 text-sm text-text-muted">
          Every trade, 1% of fees are used to buy these tokens on the open market and permanently remove them from circulation.
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

      {/* 🔥 Buy & Burn Category Tokens */}
      {!loading && categoryTokens.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-text-primary flex items-center gap-1.5">
                🔥 Buy &amp; Burn Tokens
                <span className="relative group cursor-help">
                  <span className="text-xs text-text-faint select-none">ℹ</span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-text-muted shadow-lg group-hover:block">
                    Buy &amp; burn is a mechanism where a percentage of every trade is used to permanently purchase and remove tokens from circulation — reducing supply and increasing scarcity over time.
                  </span>
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Every trade creates automatic buy pressure and removes tokens permanently. More trading = fewer tokens in circulation.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {categoryTokens.map((t) => {
              const marketCount = categoryMarketCounts[t.slug] ?? t.markets_count ?? 0;
              const symbol = `$${t.name.toUpperCase()}`;
              return (
                <div
                  key={t.slug}
                  className="rounded-xl border border-border-subtle bg-surface p-4 flex flex-col gap-3 hover:border-caldera/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-base font-bold text-text-primary font-mono">{symbol}</div>
                      <span className="relative group inline-flex shrink-0">
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold cursor-help">🔥</span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-60 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 shadow-xl">
                          <span className="block text-[11px] font-semibold text-orange-400 mb-1">Buy &amp; Burn Token</span>
                          <span className="block text-[11px] text-text-muted leading-relaxed">
                            Every prediction market trade in this category automatically uses 1% of fees to buy {symbol} on the open market and permanently remove it from circulation — reducing supply forever.
                          </span>
                        </span>
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-1 leading-relaxed">
                      Burns 🔥 with every {t.name.toLowerCase()} trade
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-caldera">
                      {marketCount.toLocaleString()} markets
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDefaultTab("buy"); setStakeCreator(t); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#7C5CFC] text-white hover:bg-[#6a4ae8] transition-colors"
                      >
                        Buy
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDefaultTab("sell"); setStakeCreator(t); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-subtle text-text-muted hover:text-text-primary hover:border-white/30 transition-colors"
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
          <div className="mb-1 grid grid-cols-[1fr_70px_70px_120px] items-center gap-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-text-faint sm:grid-cols-[1fr_80px_80px_100px_80px_120px] sm:gap-4">
            <span>Token</span>
            <span className="text-right">Price</span>
            <span className="text-right">Holders</span>
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
                  className="grid grid-cols-[1fr_70px_70px_120px] items-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3 transition-all hover:border-white/20 sm:grid-cols-[1fr_80px_80px_100px_80px_120px] sm:gap-4"
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
                      "text-right font-mono text-xs font-semibold transition-colors duration-500 sm:text-sm",
                      isFlashing ? "text-yes" : "text-text-primary"
                    )}
                  >
                    {hasToken && displayPrice > 0.01 ? formatCurrency(displayPrice) : "—"}
                  </span>

                  {/* Holders */}
                  <span className="text-right font-mono text-xs text-text-muted sm:text-sm">
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

                  {/* Buy/Sell buttons */}
                  <div className="flex gap-1.5">
                    <button onClick={() => { setDefaultTab("buy"); handleBuy(c); }} className="rounded-lg bg-[#7C5CFC] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#6a4ae8]">Buy</button>
                    <button onClick={() => { setDefaultTab("sell"); handleBuy(c); }} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-white/30 hover:text-text-primary">Sell</button>
                  </div>
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
          onClose={() => { setStakeCreator(null); setDefaultTab("buy"); }}
          desoUsername={stakeCreator.deso_username}
          livePrice={stakeCreator.creator_coin_price ?? undefined}
          initialTab={defaultTab}
        />
      )}
    </div>
  );
}
