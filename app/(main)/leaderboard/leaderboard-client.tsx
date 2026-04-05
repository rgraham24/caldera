"use client";

import { useState } from "react";
import Link from "next/link";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/types";
import { cn, formatPercentDecimal } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

type LeaderboardClientProps = {
  initialEntries: LeaderboardEntry[];
};

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "alltime", label: "All Time" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
];

const RANK_BADGES = ["🥇", "🥈", "🥉"];

export function LeaderboardClient({
  initialEntries,
}: LeaderboardClientProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("alltime");
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);

  const changePeriod = async (newPeriod: LeaderboardPeriod) => {
    setPeriod(newPeriod);
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${newPeriod}`);
      const { data } = await res.json();
      setEntries(data ?? []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Leaderboard
        </h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs bg-surface border-border-subtle text-text-primary">
              <p className="text-xs leading-relaxed">
                <strong>Score Formula:</strong>
                <br />
                ROI: 35% | Accuracy: 25% | Early Call: 25% | Consistency: 10% | Volume: 5%
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Period tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => changePeriod(p.value)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              period === p.value
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={cn("rounded-xl border border-border-subtle bg-surface overflow-x-auto", loading && "opacity-50")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-text-muted">
              <th className="px-4 py-3 text-left font-medium w-16">Rank</th>
              <th className="px-4 py-3 text-left font-medium">Trader</th>
              <th className="px-4 py-3 text-right font-medium">ROI</th>
              <th className="px-4 py-3 text-right font-medium">Accuracy</th>
              <th className="px-4 py-3 text-right font-medium">Early Call</th>
              <th className="px-4 py-3 text-right font-medium">Volume</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={entry.id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <td className="px-4 py-3 text-center">
                  {i < 3 ? (
                    <span className="text-lg">{RANK_BADGES[i]}</span>
                  ) : (
                    <span className="text-text-muted">#{entry.rank}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/profile/${entry.user.username}`}
                    className="flex items-center gap-2 hover:text-caldera"
                  >
                    {entry.user.avatar_url && (
                      <img
                        src={entry.user.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full"
                      />
                    )}
                    <span className="font-medium text-text-primary">
                      {entry.user.username}
                    </span>
                    {entry.user.is_verified && (
                      <span className="text-xs text-caldera">✓</span>
                    )}
                  </Link>
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-mono",
                    entry.roi_score >= 0 ? "text-yes" : "text-no"
                  )}
                >
                  {formatPercentDecimal(entry.roi_score / 100)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">
                  {entry.accuracy_score.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">
                  {entry.early_call_score.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-primary">
                  {entry.volume_score.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-gold">
                  {entry.composite_score.toFixed(1)}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  No leaderboard data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
