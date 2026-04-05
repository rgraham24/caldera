import Link from "next/link";
import type { LeaderboardEntry } from "@/types";
import { formatPercentDecimal } from "@/lib/utils";

type LeaderboardSnapshotProps = {
  entries: LeaderboardEntry[];
};

const RANK_BADGES = ["🥇", "🥈", "🥉"];

export function LeaderboardSnapshot({ entries }: LeaderboardSnapshotProps) {
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-header">
          Top Traders
        </h2>
        <Link
          href="/leaderboard"
          className="text-sm text-caldera hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface">
        {entries.map((entry, i) => (
          <Link
            key={entry.id}
            href={`/profile/${entry.user.username}`}
            className="flex items-center gap-4 border-b border-border-subtle px-5 py-3 last:border-b-0 transition-colors hover:bg-surface-2"
          >
            <span className="w-8 text-center text-sm">
              {i < 3 ? RANK_BADGES[i] : `#${entry.rank}`}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {entry.user.avatar_url && (
                <img
                  src={entry.user.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              )}
              <span className="truncate text-sm font-medium text-text-primary">
                {entry.user.username}
              </span>
              {entry.user.is_verified && (
                <span className="text-caldera text-xs">✓</span>
              )}
            </div>
            <span className="font-mono text-sm text-text-muted">
              {formatPercentDecimal(entry.roi_score / 100)} ROI
            </span>
            <span className="font-mono text-sm font-semibold text-gold">
              {entry.composite_score.toFixed(1)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
