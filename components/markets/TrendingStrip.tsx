"use client";

import Link from "next/link";
import type { Market } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { formatMarketTimeLeft } from "@/lib/utils";

// Hover accent color matches the category pill palette so the border
// + glow on hover stay visually coherent with the pill.
const HOVER_COLORS: Record<string, string> = {
  Sports: "#f97316",
  Politics: "#3b82f6",
  Entertainment: "#a855f7",
  Crypto: "#eab308",
  Companies: "#22c55e",
  Music: "#ec4899",
  Tech: "#06b6d4",
  Climate: "#84cc16",
  Creators: "#f97316",
};

function hoverColor(cat: string): string {
  return HOVER_COLORS[cat] ?? "#888888";
}

function TrendingCard({ market }: { market: Market }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const isYes = yes >= 50;
  const color = hoverColor(market.category ?? "");

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="group flex-none w-[280px] rounded-xl p-3 flex flex-col gap-2 transition-all duration-200"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${color}60`;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${color}30`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Top row: category pill + odds */}
      <div className="flex items-start justify-between gap-2">
        <CategoryPill category={market.category} size="sm" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-emerald-400">{yes}%</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">/</span>
          <span className="text-xs font-bold text-red-400">{no}%</span>
        </div>
      </div>

      {/* Title */}
      <p className="text-xs font-semibold leading-snug text-[var(--text-primary)] line-clamp-2 flex-1">
        {market.title}
      </p>

      {/* Probability bar */}
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${yes}%`,
            background: isYes ? "#22c55e" : "#ef4444",
          }}
        />
      </div>

      {/* Time-to-resolve — same helper as hero + all-markets cards */}
      {market.resolve_at && (
        /* eslint-disable-next-line react-hooks/purity */
        <span className="text-[10px] text-[var(--text-tertiary)]">
          {formatMarketTimeLeft(market.resolve_at)}
        </span>
      )}
    </Link>
  );
}

export function TrendingStrip({ markets }: { markets: Market[] }) {
  if (markets.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          🔥 Trending Now
        </span>
      </div>
      {/* Scrollable row with CSS marquee-pause-on-hover */}
      <div className="relative overflow-hidden">
        <div
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {markets.map((m) => (
            <TrendingCard key={m.id} market={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
