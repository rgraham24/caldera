import Link from "next/link";
import type { Market } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { ProbabilityBadge } from "@/components/shared/ProbabilityBadge";
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

  const CAT_BORDER: Record<string, string> = {
    sports: "border-t-cyan-500/40",
    politics: "border-t-violet-500/40",
    entertainment: "border-t-amber-500/40",
    music: "border-t-amber-500/40",
    viral: "border-t-red-500/40",
    streamers: "border-t-emerald-500/40",
  };
  const topBorder = CAT_BORDER[market.category] || "border-t-caldera/30";

  return (
    <Link href={`/markets/${market.slug}`}>
      <div className={cn("group flex h-full flex-col rounded-2xl border border-border-subtle/30 bg-surface p-5 transition-all duration-200 hover:border-border-visible/60 hover:-translate-y-0.5", topBorder)}>
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CategoryPill category={market.category} />
            {isLive && (
              <span className="flex items-center gap-1 rounded-full bg-no/10 px-2 py-0.5 text-[10px] font-semibold text-no">
                <span className="h-1.5 w-1.5 rounded-full bg-no animate-pulse" />
                RESOLVING TODAY
              </span>
            )}
            {resolvingSoon && !isLive && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                {`Resolves in ${Math.ceil(hoursLeft / 24)}d`}
              </span>
            )}
          </div>
          {market.resolve_at && (
            <span className="shrink-0 text-[11px] text-text-muted">
              {formatRelativeTime(market.resolve_at)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mb-4 flex-1 font-display text-xl font-bold leading-tight tracking-tight text-text-primary">
          {market.title}
        </h3>

        {/* Probability */}
        <div className="mb-4">
          <ProbabilityBadge probability={market.yes_price} />
        </div>

        {/* Volume bar */}
        <div className="mb-3 h-1 w-full rounded-full bg-border-subtle/30">
          <div
            className="h-full rounded-full bg-caldera/30"
            style={{ width: `${Math.min(100, (market.total_volume / 3000000) * 100)}%` }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-text-muted">
            {formatCompactCurrency(market.total_volume)} Vol
          </span>
          <div className="flex gap-1.5">
            <span className="rounded-full bg-yes/10 px-2.5 py-0.5 text-[10px] font-semibold text-yes">
              Yes {Math.round(market.yes_price * 100)}¢
            </span>
            <span className="rounded-full bg-no/10 px-2.5 py-0.5 text-[10px] font-semibold text-no">
              No {Math.round(market.no_price * 100)}¢
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
