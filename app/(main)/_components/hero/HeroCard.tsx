"use client";

/**
 * Coupled hero card. Chunk 2 ships a working layout to validate the data
 * flow; Chunk 4 polishes the visuals (glow, animation states, pixel-perfect
 * spacing). Behavior already correct for tonight: missing/zero prices show
 * em-dash, null momentum hides the arrow, all links go to the right place.
 */

import Link from "next/link";
import type { HeroCard as HeroCardType } from "./types";

type HeroCardProps = {
  card: HeroCardType;
};

function formatPrice(usd: number): string {
  if (!usd || usd <= 0) return "—";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

export function HeroCard({ card }: HeroCardProps) {
  const { market: m, creator } = card;
  const yes = Math.round((m.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const ticker = creator?.coin_symbol ?? creator?.deso_username?.toUpperCase() ?? null;
  const tickerLabel = ticker ? `$${ticker}` : null;

  // Reading "now" at render time matches the codebase pattern (see
  // home-client.tsx). The carousel re-renders every 8s, so countdowns
  // update naturally without a separate ticker.
  const daysLeft = m.resolve_at
    /* eslint-disable-next-line react-hooks/purity */
    ? Math.max(0, Math.ceil((new Date(m.resolve_at).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div
      className="flex flex-col rounded-2xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Coin row → links to creator page */}
      {creator ? (
        <Link
          href={`/creators/${creator.slug}`}
          className="mb-3 flex items-center gap-3 group"
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
        <div className="mb-3 h-8" />
      )}

      <div className="mb-3 h-px" style={{ background: "var(--border-subtle)" }} />

      <Link href={`/markets/${m.slug}`}>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
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
        <span className="mb-1 text-xs text-[var(--text-tertiary)]">chance YES</span>
      </div>

      <div className="mt-3 flex gap-2">
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

      <div className="mt-3 flex items-center justify-between font-mono text-xs text-[var(--text-tertiary)]">
        <span>${(m.total_volume ?? 0).toFixed(2)} vol</span>
        {daysLeft !== null && <span>{daysLeft}d left</span>}
      </div>

      <div className="mt-3 h-px" style={{ background: "var(--border-subtle)" }} />

      <p className="mt-3 text-[11px] italic text-[var(--text-tertiary)]">
        💎 1% → {tickerLabel ?? "creator coin"} on every trade
      </p>
    </div>
  );
}
