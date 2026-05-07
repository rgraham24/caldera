/**
 * Suspense fallback for the hero. Mirrors HeroCard's grid layout so the
 * skeleton-to-real-card transition doesn't shift any rows. Pulse-shimmers
 * the slots that need the DeSo refresh (price + momentum + footer);
 * paints real titles + odds + buttons immediately from the markets prop.
 */

import type { Market } from "@/types";
import Link from "next/link";

type HeroSkeletonProps = {
  markets: Market[];
};

const CARD_GRID_ROWS = [
  "auto",
  "auto",
  "3.25rem",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
].join(" ");

export function HeroSkeleton({ markets }: HeroSkeletonProps) {
  if (!markets.length) return null;
  const visible = markets.slice(0, 3);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((m) => {
        const yes = Math.round((m.yes_price ?? 0.5) * 100);
        const no = 100 - yes;
        return (
          <div
            key={m.id}
            className="grid rounded-2xl p-5"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              gridTemplateRows: CARD_GRID_ROWS,
              rowGap: "0.75rem",
            }}
          >
            {/* 1. Coin row — pulse the price/momentum slots */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-elevated)]" />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
                <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-[var(--bg-elevated)]" />
              </div>
            </div>

            {/* 2. Divider */}
            <div className="h-px" style={{ background: "var(--border-subtle)" }} />

            {/* 3. Title (fixed slot — clamps to 2 lines) */}
            <Link href={`/markets/${m.slug}`}>
              <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)]">
                {m.title}
              </h3>
            </Link>

            {/* 4. Big % */}
            <div className="flex items-end gap-2">
              <span
                className="text-4xl font-bold tabular-nums leading-none"
                style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
              >
                {yes}%
              </span>
              <span className="mb-1 text-xs text-[var(--text-tertiary)]">
                chance YES
              </span>
            </div>

            {/* 5. YES/NO buttons */}
            <div className="flex gap-2">
              <Link href={`/markets/${m.slug}`} className="flex-1">
                <button className="w-full rounded-lg border border-[var(--yes)]/20 bg-[var(--yes)]/10 py-2 text-sm font-semibold text-[var(--yes)]">
                  YES {yes}¢
                </button>
              </Link>
              <Link href={`/markets/${m.slug}`} className="flex-1">
                <button className="w-full rounded-lg border border-[var(--no)]/20 bg-[var(--no)]/10 py-2 text-sm font-semibold text-[var(--no)]">
                  NO {no}¢
                </button>
              </Link>
            </div>

            {/* 6. Volume row (no time-left in skeleton — would require Date.now) */}
            <div className="flex items-center justify-between font-mono text-xs text-[var(--text-tertiary)]">
              <span>${(m.total_volume ?? 0).toFixed(2)} vol</span>
            </div>

            {/* 7. Divider */}
            <div className="h-px" style={{ background: "var(--border-subtle)" }} />

            {/* 8. Footer slot — pulse until prices arrive */}
            <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--bg-elevated)]" />
          </div>
        );
      })}
    </div>
  );
}
