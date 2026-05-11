"use client";

import Link from "next/link";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

function isDesoPubkey(s: string): boolean {
  return /^BC1Y/i.test(s) && s.length > 40;
}

function truncateAddress(s: string): string {
  if (isDesoPubkey(s)) {
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }
  return s;
}

function initialsOf(name: string): string {
  if (!name) return "?";
  const parts = name.replace(/^@/, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Small inline SVG used in place of an initial for accounts whose
// display name is a raw DeSo pubkey — extracting "B" from BC1Y…
// was misleading (its the prefix, not their actual initial).
function PersonGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

type Trader = {
  id: string;
  username: string;
  deso_public_key: string | null;
  avatar_url: string | null;
  totalPnl: number;
  totalVolume: number;
  distinctMarkets: number;
  winRate: number;
  bestCallTitle: string | null;
  bestCallPnl: number;
};

type BiggestWin = {
  username: string;
  marketTitle: string;
  pnl: number;
};

type LeaderboardClientProps = {
  traders: Trader[];
  biggestWins: BiggestWin[];
};

function TraderAvatar({
  src,
  fallbackName,
  size = 28,
}: {
  src: string | null;
  fallbackName: string;
  size?: number;
}) {
  // Tiny inline component — renders the avatar img with an initials
  // circle fallback when src is null/broken. Inline-styled so the
  // size prop works without a Tailwind class proliferation.
  const dim = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={dim}
        className="rounded-full object-cover shrink-0 bg-surface-2"
        onError={(e) => {
          // Swap to the initials circle by hiding the img + showing sibling
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const sib = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = "flex";
        }}
      />
    );
  }
  return null;
}

function AvatarWithFallback({
  src,
  fallbackName,
  size = 28,
}: {
  src: string | null;
  fallbackName: string;
  size?: number;
}) {
  const dim = { width: size, height: size };
  const isAnon = isDesoPubkey(fallbackName);
  return (
    <span className="relative inline-flex shrink-0">
      <TraderAvatar src={src} fallbackName={fallbackName} size={size} />
      <span
        style={{ ...dim, display: src ? "none" : "flex" }}
        className="items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text-muted"
      >
        {isAnon ? <PersonGlyph size={Math.round(size * 0.5)} /> : initialsOf(fallbackName)}
      </span>
    </span>
  );
}

export function LeaderboardClient({ traders, biggestWins }: LeaderboardClientProps) {
  const { isConnected, desoPublicKey } = useAppStore();

  // Find the signed-in user's row (matches on deso_public_key for
  // reliability — username can be a raw pubkey for fan accounts).
  const youRank = desoPublicKey
    ? traders.findIndex((t) => t.deso_public_key === desoPublicKey)
    : -1;
  const youTrader = youRank >= 0 ? traders[youRank] : null;

  // Empty-state banner: only when the board is truly empty. With 1-4
  // traders the table itself tells the story; a banner on top of a
  // visible table just adds noise.
  const showEmptyBanner = traders.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight text-text-primary">
        Leaderboard
      </h1>

      {/* Connect wallet banner */}
      {!isConnected && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface px-5 py-4">
          <p className="text-sm text-text-muted">
            Connect your DeSo wallet to see your ranking
          </p>
          <button
            onClick={() => connectDeSoWallet()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            Connect
          </button>
        </div>
      )}

      {/* Your Rank card — only when signed-in user is on the board */}
      {youTrader && (
        <div className="mb-6 rounded-2xl border border-caldera/30 bg-gradient-to-br from-caldera/10 to-caldera/5 px-5 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <AvatarWithFallback
                src={youTrader.avatar_url}
                fallbackName={youTrader.username}
                size={44}
              />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-caldera font-semibold">
                  Your Rank
                </p>
                <p className="mt-0.5 font-display text-2xl font-bold text-text-primary">
                  #{youRank + 1}
                </p>
              </div>
            </div>
            <div className="flex gap-5 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted">Total PnL</p>
                <p className={cn(
                  "mt-0.5 font-mono text-lg font-bold",
                  youTrader.totalPnl >= 0 ? "text-yes" : "text-no"
                )}>
                  {youTrader.totalPnl >= 0 ? "+" : ""}{formatCurrency(youTrader.totalPnl)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted">Volume</p>
                <p className="mt-0.5 font-mono text-lg font-semibold text-text-primary">
                  {formatCompactCurrency(youTrader.totalVolume)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted">Win Rate</p>
                <p className="mt-0.5 font-mono text-lg font-semibold text-text-primary">
                  {youTrader.winRate}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty-state banner — only when there are zero traders. The
          table prints its own "No trading activity yet" row below;
          this banner adds the friendlier framing on top. */}
      {showEmptyBanner && (
        <div className="mb-6 rounded-xl border border-caldera/20 bg-caldera/5 px-5 py-3">
          <p className="text-sm text-text-primary">
            <span className="font-semibold">Caldera is new</span>
            <span className="text-text-muted">
              {" "}— be one of the first to climb the board.
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main table */}
        <div className="flex-1">
          <div className="rounded-2xl border border-border-subtle/30 bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="px-4 py-3 text-left font-medium w-12">#</th>
                  <th className="px-4 py-3 text-left font-medium">Trader</th>
                  <th
                    className="px-4 py-3 text-right font-medium"
                    title="Realized PnL across all settled, closed, and open positions"
                  >
                    Total PnL
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Volume</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Markets</th>
                  <th className="px-4 py-3 text-right font-medium">Win %</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Best Call</th>
                </tr>
              </thead>
              <tbody>
                {traders.map((t, i) => {
                  const isYou = desoPublicKey && t.deso_public_key === desoPublicKey;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "border-b border-border-subtle/20 transition-colors",
                        isYou ? "bg-caldera/5 hover:bg-caldera/10" : "hover:bg-surface-2/50"
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-text-muted">
                        {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarWithFallback
                            src={t.avatar_url}
                            fallbackName={t.username}
                            size={28}
                          />
                          <span className="font-medium text-text-primary">
                            {truncateAddress(t.username)}
                          </span>
                          {isYou && (
                            <span className="rounded-full bg-caldera/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-caldera">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-mono font-bold",
                        t.totalPnl >= 0 ? "text-yes" : "text-no"
                      )}>
                        {t.totalPnl >= 0 ? "+" : ""}{formatCurrency(t.totalPnl)}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-text-muted sm:table-cell">
                        {formatCompactCurrency(t.totalVolume)}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-text-muted sm:table-cell">
                        {t.distinctMarkets}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-muted">
                        {t.winRate}%
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {t.bestCallTitle ? (
                          <div className="max-w-[240px]">
                            <p className="text-xs text-text-muted line-clamp-2 leading-snug">
                              {t.bestCallTitle}
                            </p>
                            <p className="mt-1 font-mono text-[10px]">
                              <span className="uppercase tracking-wider text-text-faint">
                                won
                              </span>{" "}
                              <span className="font-semibold text-yes">
                                +{formatCurrency(t.bestCallPnl)}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {traders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                      No trading activity yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar — Biggest Wins */}
        <div className="w-full lg:w-72">
          <div className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
              Biggest Wins
            </h3>
            <div className="space-y-4">
              {biggestWins.map((w, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium text-text-primary">{truncateAddress(w.username)}</p>
                  <p className="mt-0.5 text-xs text-text-muted truncate">{w.marketTitle}</p>
                  <p className="mt-0.5 font-mono text-xs text-yes">Won +{formatCurrency(w.pnl)}</p>
                </div>
              ))}
              {biggestWins.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 text-center">
                  <p className="mb-1 text-sm font-semibold text-text-primary">Be the first to win big 🏆</p>
                  <p className="mb-3 text-xs text-text-muted">Trade on Caldera markets to appear here</p>
                  <Link
                    href="/markets"
                    className="inline-block rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors"
                  >
                    Browse Markets
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
