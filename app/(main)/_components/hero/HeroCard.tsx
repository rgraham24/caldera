"use client";

/**
 * Coupled hero card. Uses CSS grid with explicit grid-template-rows so
 * every card in a row aligns: titles end at the same y-coordinate,
 * YES/NO buttons start at the same y-coordinate, footer starts at the
 * same y-coordinate, regardless of title length.
 *
 * The title row is fixed at 3.25rem (~52px) — enough for 2 lines of
 * text-base + leading-snug (44px) plus a hair of breathing room.
 * line-clamp-2 truncates anything longer.
 *
 * Behavior: missing/zero prices show em-dash, null momentum hides the
 * arrow, all links go to the right place.
 */

import Link from "next/link";
import type { HeroCard as HeroCardType } from "./types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { formatMarketTimeLeft } from "@/lib/utils";

type HeroCardProps = {
  card: HeroCardType;
};

function formatPrice(usd: number): string {
  if (!usd || usd <= 0) return "—";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

const CARD_GRID_ROWS = [
  "auto",      // 1. coin row (avatar + name + ticker + price + momentum)
  "auto",      // 2. divider
  "auto",      // 3. category pill
  "3.25rem",   // 4. title (clamped to 2 lines, fixed height for cross-card alignment)
  "auto",      // 5. big % display
  "auto",      // 6. YES/NO buttons
  "auto",      // 7. volume + time-left row
  "auto",      // 8. divider
  "auto",      // 9. footer (1% → $TICKER on every trade)
].join(" ");

export function HeroCard({ card }: HeroCardProps) {
  const { market: m, creator } = card;
  const yes = Math.round((m.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const ticker = creator?.coin_symbol ?? creator?.deso_username?.toUpperCase() ?? null;
  const tickerLabel = ticker ? `$${ticker}` : null;

  // formatMarketTimeLeft reads "now" via Date.now() — same render-time
  // pattern as elsewhere in the codebase. Carousel re-renders every 8s
  // so countdowns update naturally.
  /* eslint-disable-next-line react-hooks/purity */
  const timeLeft = formatMarketTimeLeft(m.resolve_at);

  return (
    <div
      className="grid rounded-2xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        gridTemplateRows: CARD_GRID_ROWS,
        rowGap: "0.75rem",
      }}
    >
      {/* 1. Coin row → links to creator page */}
      {creator ? (
        <Link
          href={`/creators/${creator.slug}`}
          className="flex items-center gap-3 group"
        >
          {creator.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.image_url}
              alt={creator.name}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--bg-elevated)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                {creator.name}
              </span>
              {tickerLabel && (
                <span className="font-mono text-[11px] font-bold uppercase text-[var(--accent)]">
                  {tickerLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-[var(--text-tertiary)]">
              <span>{formatPrice(creator.price_usd)}</span>
              {creator.momentum?.changePercent != null && (
                <span
                  className={
                    creator.momentum.changePercent >= 0
                      ? "text-[var(--yes)]"
                      : "text-[var(--no)]"
                  }
                >
                  {creator.momentum.changePercent >= 0 ? "↑" : "↓"}
                  {Math.abs(creator.momentum.changePercent).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <div className="h-8" />
      )}

      {/* 2. Divider */}
      <div className="h-px" style={{ background: "var(--border-subtle)" }} />

      {/* 3. Category pill */}
      <div>
        <CategoryPill category={m.category} size="sm" />
      </div>

      {/* 4. Title (fixed 3.25rem slot — clamps to 2 lines max) */}
      <Link href={`/markets/${m.slug}`}>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
          {m.title}
        </h3>
      </Link>

      {/* 4. Big % display */}
      <div className="flex items-end gap-2">
        <span
          className="text-4xl font-bold tabular-nums leading-none"
          style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
        >
          {yes}%
        </span>
        <span className="mb-1 text-xs text-[var(--text-tertiary)]">chance YES</span>
      </div>

      {/* 5. YES / NO buttons */}
      <div className="flex gap-2">
        <Link href={`/markets/${m.slug}`} className="flex-1">
          <button className="w-full rounded-lg border border-[var(--yes)]/20 bg-[var(--yes)]/10 py-2 text-sm font-semibold text-[var(--yes)] hover:bg-[var(--yes)]/20 transition-colors">
            YES {yes}¢
          </button>
        </Link>
        <Link href={`/markets/${m.slug}`} className="flex-1">
          <button className="w-full rounded-lg border border-[var(--no)]/20 bg-[var(--no)]/10 py-2 text-sm font-semibold text-[var(--no)] hover:bg-[var(--no)]/20 transition-colors">
            NO {no}¢
          </button>
        </Link>
      </div>

      {/* 7. Volume + time-left */}
      <div className="flex items-center justify-between font-mono text-xs text-[var(--text-tertiary)]">
        <span>${(m.total_volume ?? 0).toFixed(2)} vol</span>
        {timeLeft && <span>{timeLeft}</span>}
      </div>

      {/* 7. Divider */}
      <div className="h-px" style={{ background: "var(--border-subtle)" }} />

      {/* 8. Footer */}
      <p className="text-[11px] italic text-[var(--text-tertiary)]">
        💎 1% → {tickerLabel ?? "creator coin"} on every trade
      </p>
    </div>
  );
}
