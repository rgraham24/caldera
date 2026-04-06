"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Creator } from "@/types";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";

type CreatorsClientProps = {
  creators: Creator[];
};

const TIERS = [
  { value: "all", label: "All" },
  { value: "individual", label: "Individuals" },
  { value: "nba", label: "NBA" },
  { value: "nfl", label: "NFL" },
  { value: "mlb", label: "MLB" },
  { value: "ncaa", label: "NCAA" },
];

const SORTS = [
  { value: "price", label: "Coin Price" },
  { value: "volume", label: "Market Volume" },
  { value: "holders", label: "Holders" },
  { value: "newest", label: "Newest" },
];

export function CreatorsClient({ creators }: CreatorsClientProps) {
  const [tierFilter, setTierFilter] = useState("all");
  const [sortBy, setSortBy] = useState("price");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = [...creators];
    if (tierFilter === "individual") {
      result = result.filter((c) => (c.entity_type || "individual") === "individual");
    } else if (["nba", "nfl", "mlb"].includes(tierFilter)) {
      result = result.filter((c) => c.sport === tierFilter);
    } else if (tierFilter === "ncaa") {
      result = result.filter((c) => (c.entity_type || "individual") === "college_team");
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.creator_coin_symbol?.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case "price": result.sort((a, b) => b.creator_coin_price - a.creator_coin_price); break;
      case "volume": result.sort((a, b) => (b.total_holder_earnings + b.total_creator_earnings) - (a.total_holder_earnings + a.total_creator_earnings)); break;
      case "holders": result.sort((a, b) => b.creator_coin_holders - a.creator_coin_holders); break;
      case "newest": result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }
    return result;
  }, [creators, tierFilter, sortBy, search]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary">
          Tokens on Caldera
        </h1>
      </div>
      <p className="mb-6 flex items-center gap-2 text-xs text-text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
        Prices update live from the DeSo blockchain
      </p>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tokens..."
            className="w-full rounded-xl border border-border-subtle bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {TIERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTierFilter(t.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tierFilter === t.value ? "bg-caldera/10 text-caldera" : "text-text-muted hover:text-text-primary"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-muted"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link key={c.id} href={`/creators/${c.slug}`}>
            <div className="rounded-2xl border border-border-subtle/30 bg-surface p-5 transition-all duration-200 hover:border-border-visible/60 hover:-translate-y-0.5">
              <div className="mb-3 flex items-center gap-3">
                <CreatorAvatar creator={c} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-text-primary">{c.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-widest text-text-muted">
                      ${c.deso_username || c.creator_coin_symbol}
                    </span>
                    {c.tier === "verified_creator" && (
                      <span className="text-caldera text-[10px]">✓</span>
                    )}
                    {c.league && (
                      <span className="rounded-full bg-caldera/10 px-1.5 py-0.5 text-[9px] font-semibold text-caldera">
                        {c.league}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mb-3 flex items-baseline gap-3">
                <span className="font-display text-xl font-bold tracking-normal text-text-primary">
                  {c.deso_username && c.creator_coin_price > 0.01 ? formatCurrency(c.creator_coin_price) : c.deso_username ? "Not active" : "—"}
                </span>
                <span className="text-xs text-text-muted">{c.creator_coin_holders.toLocaleString()} holders</span>
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{formatCompactCurrency(c.total_holder_earnings)} earned by holders</span>
                <span>{c.markets_count} markets</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
