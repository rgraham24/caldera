"use client";

import Link from "next/link";
import type { Market } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  Sports:        "#f97316",
  Politics:      "#3b82f6",
  Entertainment: "#a855f7",
  Crypto:        "#eab308",
  Companies:     "#22c55e",
  Music:         "#ec4899",
  Tech:          "#06b6d4",
  Climate:       "#84cc16",
  Creators:      "#f97316",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#888888";
}

function TrendingCard({ market }: { market: Market }) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const isYes = yes >= 50;
  const color = categoryColor(market.category ?? "");

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
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
          style={{ background: `${color}20`, color }}
        >
          {market.category}
        </span>
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
