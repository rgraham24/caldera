"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Market } from "@/types";
import { formatCompactCurrency, formatRelativeTime, cn } from "@/lib/utils";

// ── Deterministic sparkline ───────────────────────────────────────────────────
// Generates a unique but stable mini chart path from a market id + yes_price.
// No fetches, no random(), same output on every render.

function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildSparklinePath(id: string, yesPrice: number, w: number, h: number): string {
  const seed = idHash(id);
  const points = 10;
  const endY = 1 - yesPrice; // SVG y is inverted

  // Generate waypoints that end exactly at yesPrice
  const ys: number[] = [];
  for (let i = 0; i < points - 1; i++) {
    // Pseudo-random perturbation from seed
    const r = ((seed * (i + 7) * 2654435761) >>> 0) / 0xffffffff;
    const center = endY + (0.5 - endY) * (1 - i / points); // drift toward final price
    ys.push(Math.max(0.05, Math.min(0.95, center + (r - 0.5) * 0.35)));
  }
  ys.push(endY);

  // Build smooth SVG path
  const coords = ys.map((y, i) => ({
    x: (i / (points - 1)) * w,
    y: y * h,
  }));

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const cp1x = prev.x + (cur.x - prev.x) * 0.5;
    const cp1y = prev.y;
    const cp2x = prev.x + (cur.x - prev.x) * 0.5;
    const cp2y = cur.y;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
  }
  return d;
}

function MiniSparkline({ market }: { market: Market }) {
  const w = 60;
  const h = 28;
  const yesPrice = market.yes_price ?? 0.5;
  const isYes = yesPrice >= 0.5;
  const color = isYes ? "#22c55e" : "#ef4444";
  const path = buildSparklinePath(market.id, yesPrice, w, h);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
      {/* End dot */}
      <circle
        cx={w}
        cy={(1 - yesPrice) * h}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

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
          className="mb-3 h-1.5 w-full rounded-full"
          style={{ background: "var(--border-subtle)" }}
        >
          <div
            className={cn("h-full rounded-full transition-all duration-500", isYesLeading ? "bg-yes" : "bg-no")}
            style={{ width: `${yesPercent}%` }}
          />
        </div>

        {/* Bottom row: large probability + sparkline */}
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
          <div className="flex flex-col items-end gap-1">
            <MiniSparkline market={market} />
            <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
              {formatCompactCurrency(market.total_volume ?? 0)} vol
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
