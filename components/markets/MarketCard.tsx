import Link from "next/link";
import type { Market } from "@/types";
import { formatCompactCurrency, formatRelativeTime, cn } from "@/lib/utils";

type MarketCardProps = {
  market: Market;
};

export function MarketCard({ market }: MarketCardProps) {
  const hoursLeft = market.resolve_at
    ? (new Date(market.resolve_at).getTime() - Date.now()) / 3600000
    : Infinity;
  const isLive = hoursLeft < 24 && hoursLeft > 0;
  const resolvingSoon = hoursLeft < 72 && hoursLeft >= 24;

  const yesPercent = Math.round(market.yes_price * 100);
  const isYesLeading = market.yes_price >= 0.5;

  return (
    <Link href={`/markets/${market.slug}`}>
      <div
        className="group relative flex h-full flex-col rounded-xl p-4 transition-all duration-200"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
      >
        {/* Top row: category + resolve date */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              {market.category}
            </span>
            {isLive && (
              <span className="flex items-center gap-1 rounded-full bg-no/10 px-1.5 py-0.5 text-[10px] font-semibold text-no">
                <span className="h-1.5 w-1.5 rounded-full bg-no animate-pulse" />
                TODAY
              </span>
            )}
            {resolvingSoon && !isLive && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                {`${Math.ceil(hoursLeft / 24)}d`}
              </span>
            )}
          </div>
          {market.resolve_at && (
            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
              {formatRelativeTime(market.resolve_at)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mb-4 flex-1 text-base font-semibold leading-snug text-[var(--text-primary)] line-clamp-2">
          {market.title}
        </h3>

        {/* Probability bar */}
        <div
          className="mb-4 h-1.5 w-full rounded-full"
          style={{ background: "var(--border-subtle)" }}
        >
          <div
            className={cn("h-full rounded-full transition-all duration-500", isYesLeading ? "bg-yes" : "bg-no")}
            style={{ width: `${yesPercent}%` }}
          />
        </div>

        {/* Bottom row: large probability + volume */}
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn("font-display text-2xl font-bold tabular-nums leading-none", isYesLeading ? "text-yes" : "text-no")}
            >
              {yesPercent}%
            </span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {isYesLeading ? "YES" : "NO"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-medium tabular-nums text-[var(--text-tertiary)]">
              {formatCompactCurrency(market.total_volume)} Vol
            </span>
            <span
              className="text-xs text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100"
            >
              Trade →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
