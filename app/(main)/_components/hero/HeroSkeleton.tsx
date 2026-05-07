/**
 * Suspense fallback for the hero. Renders the coupled-card shell with the
 * markets data we already have (titles + odds + buttons) and a pulse on
 * the price + momentum slots that aren't ready yet.
 *
 * No "loading…" text — better to show a card with a price shimmer than
 * empty space, since markets data is real and fast.
 */

import type { Market } from "@/types";
import Link from "next/link";

type HeroSkeletonProps = {
  markets: Market[];
};

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
            className="flex flex-col rounded-2xl p-5"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {/* Coin row — pulse the price/momentum slots */}
            <div className="mb-3 flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-elevated)]" />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
                <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-[var(--bg-elevated)]" />
              </div>
            </div>

            <div
              className="mb-3 h-px"
              style={{ background: "var(--border-subtle)" }}
            />

            <Link href={`/markets/${m.slug}`}>
              <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)]">
                {m.title}
              </h3>
            </Link>

            <div className="mt-4 mb-1 flex items-end gap-2">
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

            <div className="mt-3 flex gap-2">
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

            <div className="mt-3 text-xs text-[var(--text-tertiary)] font-mono">
              ${(m.total_volume ?? 0).toFixed(2)} vol
            </div>

            <div
              className="mt-3 h-px"
              style={{ background: "var(--border-subtle)" }}
            />

            {/* Footer slot — empty pulse until prices land */}
            <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-[var(--bg-elevated)]" />
          </div>
        );
      })}
    </div>
  );
}
