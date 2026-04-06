"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { formatCurrency, cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

type CreatorHolding = {
  creator: {
    name: string;
    slug: string;
    deso_username: string | null;
    deso_public_key: string | null;
    creator_coin_price: number;
    creator_coin_holders: number;
    total_coins_in_circulation: number;
  };
  coinsHeld: number;
  costBasis: number; // total USD spent
  avgPurchasePrice: number;
};

type Holder = {
  username: string;
  balanceCoins: number;
  percentOwned: number;
};

type CreatorHoldingCardProps = {
  holding: CreatorHolding;
  weeklyVolume: number; // for this creator's markets
  activeMarkets: Array<{ title: string; slug: string; yes_price: number }>;
};

export function CreatorHoldingCard({
  holding,
  weeklyVolume,
  activeMarkets,
}: CreatorHoldingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loadingHolders, setLoadingHolders] = useState(false);

  const { creator, coinsHeld, costBasis, avgPurchasePrice } = holding;
  const currentValue = coinsHeld * creator.creator_coin_price;
  const unrealizedPnl = costBasis > 0 ? currentValue - costBasis : 0;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
  const percentOfSupply =
    creator.total_coins_in_circulation > 0
      ? (coinsHeld / creator.total_coins_in_circulation) * 100
      : 0;
  const weeklyEarnings = percentOfSupply > 0 ? (percentOfSupply / 100) * weeklyVolume * 0.0075 : 0;
  const sym = creator.deso_username || creator.name;

  useEffect(() => {
    if (expanded && holders.length === 0 && creator.slug) {
      fetch(`/api/creators/${creator.slug}/holders`)
        .then((r) => r.json())
        .then(({ data }) => setHolders(data || []))
        .finally(() => setLoadingHolders(false));
    }
  }, [expanded, holders.length, creator.slug]);

  return (
    <div className="rounded-2xl border border-border-subtle/30 bg-surface overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-surface-2/50 transition-colors"
      >
        <CreatorAvatar creator={creator} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{creator.name}</span>
            <span className="text-[10px] text-text-muted">${sym}</span>
          </div>
          <span className="text-xs text-text-muted">
            {coinsHeld.toFixed(4)} coins · {creator.creator_coin_holders} holders
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-sm font-bold text-text-primary tracking-normal">
            {formatCurrency(currentValue)}
          </p>
          {weeklyEarnings > 0 && (
            <p className="font-mono text-[10px] text-yes">+{formatCurrency(weeklyEarnings)}/wk</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
        )}
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border-subtle/30 p-4 space-y-5">
          {/* Section A: Position */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Your Position</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Coins held</span>
                <span className="font-mono text-text-primary">{coinsHeld.toFixed(4)} ${sym}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">% of supply</span>
                <span className="font-mono text-text-primary">{percentOfSupply.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Current value</span>
                <span className="font-mono text-text-primary">{formatCurrency(currentValue)}</span>
              </div>
              {costBasis > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Avg purchase</span>
                    <span className="font-mono text-text-primary">{formatCurrency(avgPurchasePrice)}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-text-muted">Unrealized P/L</span>
                    <span className={cn("font-mono font-bold", unrealizedPnl >= 0 ? "text-yes" : "text-no")}>
                      {unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(unrealizedPnl)} ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}%)
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section C: Earnings */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Your Earnings</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Est. this week</span>
                <span className="font-mono text-yes">~{formatCurrency(weeklyEarnings)}</span>
              </div>
              <p className="text-[10px] text-text-faint mt-1">
                {percentOfSupply.toFixed(1)}% × {formatCurrency(weeklyVolume)} weekly vol × 0.75%
              </p>
            </div>

            {activeMarkets.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-text-muted mb-1">{activeMarkets.length} active market{activeMarkets.length > 1 ? "s" : ""}</p>
                {activeMarkets.map((m) => (
                  <Link key={m.slug} href={`/markets/${m.slug}`} className="block text-xs text-text-primary hover:text-caldera py-0.5">
                    {m.title.slice(0, 50)}… → {Math.round(m.yes_price * 100)}% YES
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Section D: Holders */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Top Holders</h4>
            {loadingHolders ? (
              <p className="text-xs text-text-muted">Loading from DeSo...</p>
            ) : holders.length > 0 ? (
              <div className="space-y-1">
                {holders.slice(0, 5).map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">
                      {i === 0 ? "👑 " : `#${i + 1} `}
                      {h.username}
                    </span>
                    <span className="font-mono text-text-primary">
                      {h.balanceCoins.toFixed(2)} ({h.percentOwned.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No holder data available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
