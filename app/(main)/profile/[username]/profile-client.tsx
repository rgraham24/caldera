"use client";

import { useState } from "react";
import Link from "next/link";
import type { User, LeaderboardSnapshot } from "@/types";
import { cn, formatCurrency, formatPercentDecimal } from "@/lib/utils";

type ProfileClientProps = {
  user: User;
  positions: Array<{
    id: string;
    side: string;
    quantity: number;
    avg_entry_price: number;
    total_cost: number;
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
  leaderboard: LeaderboardSnapshot | null;
};

type Tab = "open" | "history";

export function ProfileClient({
  user,
  positions,
  leaderboard,
}: ProfileClientProps) {
  const [tab, setTab] = useState<Tab>("open");

  const openPositions = positions.filter((p) => p.status === "open");
  const settledPositions = positions.filter((p) => p.status === "settled");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      {/* Profile header */}
      <div className="mb-8 flex items-start gap-5">
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full"
          />
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {user.display_name || user.username}
            </h1>
            {user.is_verified && (
              <span className="rounded-full bg-caldera/10 px-2 py-0.5 text-xs font-medium text-caldera">
                Verified
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted">@{user.username}</p>
          {user.bio && (
            <p className="mt-2 text-sm text-text-muted max-w-lg">{user.bio}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          {
            label: "ROI",
            value: leaderboard
              ? formatPercentDecimal((leaderboard.roi_score ?? 0) / 100)
              : "-",
          },
          {
            label: "Accuracy",
            value: leaderboard
              ? `${(leaderboard.accuracy_score ?? 0).toFixed(1)}%`
              : "-",
          },
          {
            label: "Markets Traded",
            value: String(positions.length),
          },
          {
            label: "Reputation",
            value: (user.reputation_score ?? 0).toFixed(1),
          },
          {
            label: "Rank",
            value: leaderboard?.rank ? `#${leaderboard.rank}` : "-",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-subtle bg-surface p-4 text-center"
          >
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1 w-fit">
        {(
          [
            { key: "open" as Tab, label: "Open Calls" },
            { key: "history" as Tab, label: "History" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
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
      <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-text-muted">
              <th className="px-4 py-3 text-left font-medium">Market</th>
              <th className="px-4 py-3 text-left font-medium">Side</th>
              <th className="px-4 py-3 text-right font-medium">Entry</th>
              <th className="px-4 py-3 text-right font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {(tab === "open" ? openPositions : settledPositions).map((pos) => (
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
                  {(pos.avg_entry_price * 100).toFixed(1)}¢
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-mono font-medium",
                    (tab === "open"
                      ? pos.unrealized_pnl_cached
                      : pos.realized_pnl) >= 0
                      ? "text-yes"
                      : "text-no"
                  )}
                >
                  {formatCurrency(
                    tab === "open"
                      ? pos.unrealized_pnl_cached
                      : pos.realized_pnl
                  )}
                </td>
              </tr>
            ))}
            {(tab === "open" ? openPositions : settledPositions).length ===
              0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  {tab === "open"
                    ? "No open positions"
                    : "No trade history"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
