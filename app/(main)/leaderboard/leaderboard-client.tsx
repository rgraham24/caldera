"use client";

import Link from "next/link";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

function truncateAddress(s: string): string {
  if (/^BC1Y/i.test(s) && s.length > 12) {
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  }
  return s;
}

type Trader = {
  id: string;
  username: string;
  avatar_url: string | null;
  totalPnl: number;
  totalVolume: number;
  distinctMarkets: number;
  winRate: number;
  bestCallTitle: string | null;
  bestCallPnl: number;
};

type BiggestWin = {
  username: string;
  marketTitle: string;
  pnl: number;
};

type LeaderboardClientProps = {
  traders: Trader[];
  biggestWins: BiggestWin[];
};

export function LeaderboardClient({ traders, biggestWins }: LeaderboardClientProps) {
  const { isConnected } = useAppStore();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight text-text-primary">
        Leaderboard
      </h1>

      {/* Connect wallet banner */}
      {!isConnected && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface px-5 py-4">
          <p className="text-sm text-text-muted">
            Connect your DeSo wallet to see your ranking
          </p>
          <button
            onClick={() => connectDeSoWallet()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            Connect
          </button>
        </div>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main table */}
        <div className="flex-1">
          <div className="rounded-2xl border border-border-subtle/30 bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="px-4 py-3 text-left font-medium w-12">#</th>
                  <th className="px-4 py-3 text-left font-medium">Trader</th>
                  <th className="px-4 py-3 text-right font-medium">P/L</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Volume</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Markets</th>
                  <th className="px-4 py-3 text-right font-medium">Win %</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Best Call</th>
                </tr>
              </thead>
              <tbody>
                {traders.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-b border-border-subtle/20 hover:bg-surface-2/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-text-primary">{truncateAddress(t.username)}</span>
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-mono font-bold",
                      t.totalPnl >= 0 ? "text-yes" : "text-no"
                    )}>
                      {t.totalPnl >= 0 ? "+" : ""}{formatCurrency(t.totalPnl)}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-text-muted sm:table-cell">
                      {formatCompactCurrency(t.totalVolume)}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-text-muted sm:table-cell">
                      {t.distinctMarkets}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-muted">
                      {t.winRate}%
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {t.bestCallTitle ? (
                        <span className="text-xs text-text-muted">
                          {t.bestCallTitle}… <span className="text-yes font-mono">+{formatCurrency(t.bestCallPnl)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {traders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                      No trading activity yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar — Biggest Wins */}
        <div className="w-full lg:w-72">
          <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
              Biggest Wins
            </h3>
            <div className="space-y-4">
              {biggestWins.map((w, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium text-text-primary">{w.username}</p>
                  <p className="mt-0.5 text-xs text-text-muted truncate">{w.marketTitle}</p>
                  <p className="mt-0.5 font-mono text-xs text-yes">Won +{formatCurrency(w.pnl)}</p>
                </div>
              ))}
              {biggestWins.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 text-center">
                  <p className="mb-1 text-sm font-semibold text-text-primary">Be the first to win big 🏆</p>
                  <p className="mb-3 text-xs text-text-muted">Trade on Caldera markets to appear here</p>
                  <Link
                    href="/markets"
                    className="inline-block rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors"
                  >
                    Browse Markets
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
