"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Market } from "@/types";
import { formatCompactCurrency, formatMarketTimeLeft, cn } from "@/lib/utils";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { Sparkline } from "@/components/markets/Sparkline";
import { requestSparkline } from "@/lib/sparkline/batch";

export type SparklinePoint = {
  recorded_at: string;
  yes_price: number;
};

type MarketCardProps = {
  market: Market;
  /**
   * When true, render a small "Nh ago" / "Nd ago" timestamp in the
   * top-right of the card opposite the CategoryPill (replaces the
   * resolve-date display in that slot). Used by the /new feed; off
   * everywhere else so the All Markets / hero / trending surfaces
   * keep the resolve-date as their primary date hint.
   */
  showCreatedAgo?: boolean;
  /**
   * Pre-fetched price history. When provided, skips the client-side
   * auto-fetch and renders this data directly. Most callers omit
   * this — MarketCard fetches its own data via the batched module-
   * level cache in lib/sparkline/batch.ts.
   */
  priceHistory?: SparklinePoint[];
};

function formatCreatedAgo(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 0) return "Just now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MarketCard({ market, showCreatedAgo = false, priceHistory }: MarketCardProps) {
  const router = useRouter();
  const now = new Date();
  const hoursLeft = market.resolve_at
    ? (new Date(market.resolve_at).getTime() - now.getTime()) / 3600000
    : Infinity;
  const isLive = hoursLeft < 24 && hoursLeft > 0;
  const resolvingSoon = hoursLeft < 72 && hoursLeft >= 24;

  const yesPercent = Math.round((market.yes_price ?? 0) * 100);
  const isYesLeading = (market.yes_price ?? 0) >= 0.5;

  // Sparkline data: prefer pre-fetched priceHistory prop if provided,
  // otherwise auto-fetch via the batched module-level cache so multiple
  // cards on a page share one API call.
  const [sparklineData, setSparklineData] = useState<number[]>(() => {
    if (!priceHistory || priceHistory.length < 2) return [];
    return priceHistory.map((p) => Number(p.yes_price)).filter(Number.isFinite);
  });
  useEffect(() => {
    if (priceHistory && priceHistory.length >= 2) return; // caller pre-fed us
    let cancelled = false;
    requestSparkline(market.id).then((points) => {
      if (!cancelled && points.length >= 2) setSparklineData(points);
    });
    return () => {
      cancelled = true;
    };
  }, [market.id, priceHistory]);

  return (
    <Link href={`/markets/${market.slug}`}>
      <div
        className="group relative flex h-full flex-col rounded-xl border border-border-subtle bg-surface p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-caldera/20 hover:shadow-lg hover:shadow-caldera/10"
      >
        {/* Top row: category + resolve date */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CategoryPill category={market.category} size="sm" />
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
          {showCreatedAgo ? (
            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
              {formatCreatedAgo(market.created_at)}
            </span>
          ) : market.resolve_at ? (
            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
              {formatMarketTimeLeft(market.resolve_at)}
            </span>
          ) : null}
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

        {/* Probability bar — Polymarket-style split: green YES on the left,
            red NO on the right, totalling 100% width. Reads as "the market
            is split N/M%" instead of "weak N% bar with empty space on the
            right." 0.5px gap between halves makes the split visually
            obvious without breaking the rounded-pill silhouette. */}
        <div className="mb-3 flex h-1.5 w-full gap-0.5">
          <div
            className="h-full rounded-l-full transition-all duration-500"
            style={{ width: `${yesPercent}%`, background: "var(--yes)" }}
          />
          <div
            className="h-full rounded-r-full transition-all duration-500"
            style={{ width: `${100 - yesPercent}%`, background: "var(--no)" }}
          />
        </div>

        {/* Bottom row: large probability + sparkline */}
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn("font-display text-2xl font-bold tabular-nums tracking-tight leading-none", isYesLeading ? "text-yes" : "text-no")}
            >
              {yesPercent}%
            </span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {isYesLeading ? "YES" : "NO"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            {sparklineData.length >= 2 && (
              <Sparkline
                data={sparklineData}
                color={isYesLeading ? "var(--color-yes)" : "var(--color-no)"}
                width={64}
                height={28}
              />
            )}
            {(() => {
              const vol = market.total_volume ?? 0;
              // Hide volume for old seed data (created before Apr 7 2026) — it was simulated
              const isSimulated = (market.created_at ?? "") < "2026-04-07" && vol > 100;
              return vol > 0 && !isSimulated ? (
                <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
                  {formatCompactCurrency(vol)} vol
                </span>
              ) : null;
            })()}
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
            className="flex-1 py-2 rounded-lg text-xs font-semibold tabular-nums bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-150 active:scale-[0.98]"
          >
            YES {yesPercent}¢
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/markets/${market.slug}?side=no`);
            }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold tabular-nums bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all duration-150 active:scale-[0.98]"
          >
            NO {100 - yesPercent}¢
          </button>
        </div>
      </div>
    </Link>
  );
}
