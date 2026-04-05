import Link from "next/link";
import type { Market } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { ProbabilityBadge } from "@/components/shared/ProbabilityBadge";
import { formatCompactCurrency, formatRelativeTime } from "@/lib/utils";

type MarketCardProps = {
  market: Market;
};

export function MarketCard({ market }: MarketCardProps) {
  return (
    <Link href={`/markets/${market.slug}`}>
      <div className="group flex h-full flex-col rounded-2xl border border-border-subtle/30 bg-surface p-5 transition-all duration-200 hover:border-border-visible/60 hover:-translate-y-0.5">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <CategoryPill category={market.category} />
          {market.resolve_at && (
            <span className="shrink-0 text-[11px] text-text-muted">
              {formatRelativeTime(market.resolve_at)}
            </span>
          )}
        </div>

        {/* Title — hero of the card */}
        <h3 className="mb-4 flex-1 font-display text-xl font-bold leading-tight tracking-tight text-text-primary">
          {market.title}
        </h3>

        {/* Probability */}
        <div className="mb-4">
          <ProbabilityBadge probability={market.yes_price} />
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between border-t border-border-subtle/20 pt-3">
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
