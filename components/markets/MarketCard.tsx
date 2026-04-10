"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Market } from "@/types";
import { formatCompactCurrency, formatRelativeTime, cn } from "@/lib/utils";

type MarketCardProps = {
  market: Market;
};

export function MarketCard({ market }: MarketCardProps) {
  const router = useRouter();
  const now = new Date();
  const hoursLeft = market.resolve_at
    ? (new Date(market.resolve_at).getTime() - now.getTime()) / 3600000
    : Infinity;
  const isLive = hoursLeft < 24 && hoursLeft > 0;
  const resolvingSoon = hoursLeft < 72 && hoursLeft >= 24;

  const yesPercent = Math.round((market.yes_price ?? 0) * 100);
  const isYesLeading = (market.yes_price ?? 0) >= 0.5;

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
        <h3 className="mb-2 flex-1 text-base font-semibold leading-snug text-[var(--text-primary)] line-clamp-2">
          {market.title}
        </h3>

        {/* Speculation pool badge */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(market as any).is_speculation_pool && (
          <span className="mb-3 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            ⚠ Unverified · Speculative
          </span>
        )}

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
              {formatCompactCurrency(market.total_volume ?? 0)} Vol
            </span>
          </div>
        </div>

        {/* YES / NO quick-trade buttons */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/markets/${market.slug}?side=yes`);
            }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-150 active:scale-[0.98]"
          >
            YES {yesPercent}¢
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/markets/${market.slug}?side=no`);
            }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all duration-150 active:scale-[0.98]"
          >
            NO {100 - yesPercent}¢
          </button>
        </div>
      </div>
    </Link>
  );
}
