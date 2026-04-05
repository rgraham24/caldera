"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";

type PortfolioClientProps = {
  positions: Array<{
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
  }>;
  watchlist: Array<{
    id: string;
    market: {
      title: string;
      slug: string;
      yes_price: number;
      total_volume: number;
      category: string;
    } | null;
  }>;
};

type Tab = "open" | "settled" | "watchlist" | "earnings";

const MOCK_EARNINGS = [
  { creator: "MrBeast", symbol: "MRBEAST", holdings: 420, earnedWeek: 8.45, earnedTotal: 142.80 },
  { creator: "Kai Cenat", symbol: "KAI", holdings: 1200, earnedWeek: 12.30, earnedTotal: 98.50 },
  { creator: "IShowSpeed", symbol: "SPEED", holdings: 800, earnedWeek: 5.20, earnedTotal: 67.40 },
  { creator: "Ice Spice", symbol: "ICE", holdings: 350, earnedWeek: 2.10, earnedTotal: 31.20 },
];

export function PortfolioClient({ positions, watchlist }: PortfolioClientProps) {
  const [tab, setTab] = useState<Tab>("open");

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        Portfolio
      </h1>

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
            { key: "earnings" as Tab, label: "Creator Earnings" },
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

      {tab === "earnings" && (
        <div>
          <div className="mb-4 rounded-xl border border-caldera/20 bg-caldera/5 p-4">
            <p className="text-sm text-text-primary">
              You hold positions in <span className="font-bold text-caldera">{MOCK_EARNINGS.length} creators</span>.
              Total earned:{" "}
              <span className="font-mono font-bold text-caldera">
                {formatCurrency(MOCK_EARNINGS.reduce((s, e) => s + e.earnedTotal, 0))}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="px-4 py-3 text-left font-medium">Creator</th>
                  <th className="px-4 py-3 text-left font-medium">Stake</th>
                  <th className="px-4 py-3 text-right font-medium">Holdings</th>
                  <th className="px-4 py-3 text-right font-medium">This Week</th>
                  <th className="px-4 py-3 text-right font-medium">Total Earned</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_EARNINGS.map((e) => (
                  <tr
                    key={e.symbol}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {e.creator}
                    </td>
                    <td className="px-4 py-3 font-mono text-caldera text-xs">
                      ${e.symbol}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {e.holdings.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-yes">
                      +{formatCurrency(e.earnedWeek)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-text-primary">
                      {formatCurrency(e.earnedTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Earnings distribute weekly. Next distribution: April 11, 2026
          </p>
        </div>
      )}
    </div>
  );
}
