"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { CreatorHoldingCard } from "@/components/portfolio/CreatorHoldingCard";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

type Position = {
  id: string;
  side: string;
  quantity: number;
  avg_entry_price: number;
  total_cost: number;
  fees_paid: number;
  realized_pnl: number;
  unrealized_pnl_cached: number;
  status: string;
  market: {
    title: string;
    slug: string;
    yes_price: number;
    no_price: number;
    status: string;
  };
};

type WatchlistItem = {
  id: string;
  market: {
    title: string;
    slug: string;
    yes_price: number;
    total_volume: number;
    category: string;
  } | null;
};

type Tab = "open" | "settled" | "watchlist" | "holdings";

const MOCK_HOLDINGS = [
  {
    creator: { name: "Tiger Woods", slug: "tiger-woods", deso_username: "tigerwoods", deso_public_key: null, creator_coin_price: 47.47, creator_coin_holders: 24, total_coins_in_circulation: 24 },
    coinsHeld: 2.5, costBasis: 95, avgPurchasePrice: 38, activeMarkets: [
      { title: "Will Tiger Woods be convicted of DUI?", slug: "tiger-woods-dui-conviction", yes_price: 0.62 },
    ],
    weeklyVolume: 42000,
  },
  {
    creator: { name: "Elon Musk", slug: "elon-musk", deso_username: "elonmusk", deso_public_key: null, creator_coin_price: 188.79, creator_coin_holders: 9702, total_coins_in_circulation: 9702 },
    coinsHeld: 0.5, costBasis: 85, avgPurchasePrice: 170, activeMarkets: [
      { title: "Will Elon Musks X platform lose 20%?", slug: "x-platform-ad-revenue-drop", yes_price: 0.58 },
    ],
    weeklyVolume: 28000,
  },
  {
    creator: { name: "dharmesh", slug: "dharmesh", deso_username: "dharmesh", deso_public_key: null, creator_coin_price: 665.14, creator_coin_holders: 2311, total_coins_in_circulation: 2311 },
    coinsHeld: 0.3, costBasis: 180, avgPurchasePrice: 600, activeMarkets: [],
    weeklyVolume: 0,
  },
];

export function PortfolioClient() {
  const [tab, setTab] = useState<Tab>("open");
  const [positions, setPositions] = useState<Position[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { isConnected, desoPublicKey, desoBalanceDeso, desoBalanceUSD, openDepositModal } = useAppStore();

  useEffect(() => {
    if (!desoPublicKey) {
      setLoading(false);
      return;
    }
    fetch(`/api/portfolio?desoPublicKey=${encodeURIComponent(desoPublicKey)}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setPositions(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [desoPublicKey]);

  const openPositions = positions.filter((p) => p.status === "open");
  const settledPositions = positions.filter((p) => p.status === "settled");

  const totalValue = openPositions.reduce((sum, p) => {
    const currentPrice =
      p.side === "yes" ? p.market.yes_price : p.market.no_price;
    return sum + p.quantity * currentPrice;
  }, 0);

  const totalUnrealizedPnl = openPositions.reduce(
    (sum, p) => sum + p.unrealized_pnl_cached,
    0
  );
  const totalRealizedPnl = settledPositions.reduce(
    (sum, p) => sum + p.realized_pnl,
    0
  );
  const totalFeesPaid = positions.reduce((sum, p) => sum + p.fees_paid, 0);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6 lg:px-8">
        <p className="mb-4 text-text-muted">Connect your wallet to view your portfolio.</p>
        <button
          onClick={connectDeSoWallet}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-gray-100"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6 lg:px-8">
        <p className="text-text-muted">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        Portfolio
      </h1>

      {/* Wallet section */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text-primary">Your Wallet</h2>
          <button
            onClick={openDepositModal}
            className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)]/90"
          >
            Add Funds
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-text-muted">DESO Balance</p>
            <p className="mt-1 font-mono text-base font-semibold text-text-primary">
              {desoBalanceDeso.toFixed(4)} DESO
            </p>
            <p className="font-mono text-xs text-text-muted">
              ≈ ${desoBalanceUSD.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">USD Value</p>
            <p className="mt-1 font-mono text-base font-semibold text-yes">
              ${desoBalanceUSD.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total Value", value: formatCurrency(totalValue) },
          {
            label: "Unrealized PnL",
            value: formatCurrency(totalUnrealizedPnl),
            color: totalUnrealizedPnl >= 0 ? "text-yes" : "text-no",
          },
          {
            label: "Realized PnL",
            value: formatCurrency(totalRealizedPnl),
            color: totalRealizedPnl >= 0 ? "text-yes" : "text-no",
          },
          { label: "Fees Paid", value: formatCurrency(totalFeesPaid) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-subtle bg-surface p-4"
          >
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p
              className={cn(
                "mt-1 font-mono text-lg font-semibold",
                stat.color || "text-text-primary"
              )}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1">
        {(
          [
            { key: "open" as Tab, label: `Open (${openPositions.length})` },
            { key: "settled" as Tab, label: `Settled (${settledPositions.length})` },
            { key: "watchlist" as Tab, label: `Watchlist (${watchlist.length})` },
            { key: "holdings" as Tab, label: "Creator Holdings" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "open" && (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Market</th>
                <th className="px-4 py-3 text-left font-medium">Side</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Avg Entry</th>
                <th className="px-4 py-3 text-right font-medium">Current</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((pos) => {
                const currentPrice =
                  pos.side === "yes"
                    ? pos.market.yes_price
                    : pos.market.no_price;
                return (
                  <tr
                    key={pos.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/markets/${pos.market.slug}`}
                        className="text-text-primary hover:text-caldera"
                      >
                        {pos.market.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          pos.side === "yes"
                            ? "bg-yes/10 text-yes"
                            : "bg-no/10 text-no"
                        )}
                      >
                        {pos.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {pos.quantity.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(pos.avg_entry_price * 100).toFixed(1)}¢
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(currentPrice * 100).toFixed(1)}¢
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono font-medium",
                        pos.unrealized_pnl_cached >= 0
                          ? "text-yes"
                          : "text-no"
                      )}
                    >
                      {formatCurrency(pos.unrealized_pnl_cached)}
                    </td>
                  </tr>
                );
              })}
              {openPositions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No open positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settled" && (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Market</th>
                <th className="px-4 py-3 text-left font-medium">Side</th>
                <th className="px-4 py-3 text-right font-medium">Outcome</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {settledPositions.map((pos) => (
                <tr
                  key={pos.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/markets/${pos.market.slug}`}
                      className="text-text-primary hover:text-caldera"
                    >
                      {pos.market.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-semibold",
                        pos.side === "yes"
                          ? "bg-yes/10 text-yes"
                          : "bg-no/10 text-no"
                      )}
                    >
                      {pos.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted">
                    {pos.market.status === "resolved" ? "Resolved" : "-"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono font-medium",
                      pos.realized_pnl >= 0 ? "text-yes" : "text-no"
                    )}
                  >
                    {formatCurrency(pos.realized_pnl)}
                  </td>
                </tr>
              ))}
              {settledPositions.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No settled positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "watchlist" && (
        <div className="rounded-xl border border-border-subtle bg-surface divide-y divide-border-subtle">
          {watchlist.map(
            (w) =>
              w.market && (
                <Link
                  key={w.id}
                  href={`/markets/${w.market.slug}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {w.market.title}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-text-muted">
                    {formatCompactCurrency(w.market.total_volume)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      w.market.yes_price >= 0.5 ? "text-yes" : "text-no"
                    )}
                  >
                    {Math.round(w.market.yes_price * 100)}%
                  </span>
                </Link>
              )
          )}
          {watchlist.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-text-muted">
              No items in watchlist
            </p>
          )}
        </div>
      )}

      {tab === "holdings" && (
        <div>
          {/* Summary */}
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border-subtle bg-surface p-4">
              <p className="text-xs text-text-muted">Holdings Value</p>
              <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
                {formatCurrency(MOCK_HOLDINGS.reduce((s, h) => s + h.coinsHeld * h.creator.creator_coin_price, 0))}
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface p-4">
              <p className="text-xs text-text-muted">Creators Held</p>
              <p className="mt-1 font-mono text-lg font-semibold text-caldera">{MOCK_HOLDINGS.length}</p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface p-4">
              <p className="text-xs text-text-muted">Est. Weekly</p>
              <p className="mt-1 font-mono text-lg font-semibold text-yes">
                ~{formatCurrency(MOCK_HOLDINGS.reduce((s, h) => {
                  const pct = h.creator.total_coins_in_circulation > 0 ? h.coinsHeld / h.creator.total_coins_in_circulation : 0;
                  return s + pct * h.weeklyVolume * 0.01;
                }, 0))}
              </p>
            </div>
          </div>

          {/* Creator cards */}
          <div className="space-y-3">
            {MOCK_HOLDINGS.map((h) => (
              <CreatorHoldingCard
                key={h.creator.slug}
                holding={{
                  creator: h.creator,
                  coinsHeld: h.coinsHeld,
                  costBasis: h.costBasis,
                  avgPurchasePrice: h.avgPurchasePrice,
                }}
                weeklyVolume={h.weeklyVolume}
                activeMarkets={h.activeMarkets}
              />
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
