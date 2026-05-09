"use client";

/**
 * Top holders for a creator's coin, on /creators/[slug].
 *
 * Pulls from /api/creators/[slug]/holders which proxies DeSo's
 * get-hodlers-for-public-key. The local creator_coin_holders table
 * (5 rows platform-wide) is no longer consulted — it was a stale
 * cache that never got populated for the 14k+ creator universe.
 *
 * Display: rank (gold/silver/bronze for top 3) + avatar + handle +
 * coins held + USD value. Clicking a holder opens their DeSo profile
 * on Diamond, since most holders won't have a Caldera creator row.
 */

import { useEffect, useState } from "react";
import { getTokenSymbolDisplay } from "@/lib/utils/tokenSymbol";
import { formatCurrency } from "@/lib/utils";

type Holder = {
  username: string;
  publicKey: string;
  balanceCoins: number;
  percentOwned: number;
  valueUSD: number;
};

type Props = {
  creatorSlug: string;
  coinSymbol: string;
  creator?: {
    slug?: string | null;
    deso_username?: string | null;
    creator_coin_symbol?: string | null;
    token_symbol?: string | null;
  };
};

export function HolderLeaderboard({ creatorSlug, coinSymbol, creator }: Props) {
  const tokenDisplay = creator ? getTokenSymbolDisplay(creator) : `$${coinSymbol}`;
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/creators/${creatorSlug}/holders`)
      .then((r) => r.json())
      .then(({ data }: { data?: Holder[] }) => {
        if (cancelled) return;
        setHolders(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // Empty state below handles failure mode silently.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorSlug]);

  if (loading) {
    return (
      <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
        <h2 className="section-header mb-4">Top Holders</h2>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-surface-2 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (holders.length === 0) {
    return (
      <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
        <h2 className="section-header mb-2">Top Holders</h2>
        <p className="text-sm text-text-muted">
          No holders yet. Hold {tokenDisplay} and earn from every trade in this market.
        </p>
      </div>
    );
  }

  const rankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const rankLabel = (rank: number) => {
    if (rank === 1) return "Biggest Fan";
    if (rank === 2) return "Top Holder";
    if (rank === 3) return "Early Holder";
    return null;
  };

  return (
    <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-header">Top Holders</h2>
        <span className="text-xs text-text-muted">{tokenDisplay} holders</span>
      </div>

      <div className="space-y-2">
        {holders.map((holder, i) => {
          const rank = i + 1;
          const handle = holder.username && !holder.username.startsWith("BC1")
            ? `@${holder.username}`
            : `${holder.publicKey.slice(0, 8)}…`;
          const label = rankLabel(rank);
          const isTop3 = rank <= 3;
          const profileHref = holder.username && !holder.username.startsWith("BC1")
            ? `https://diamondapp.com/u/${holder.username}`
            : null;
          const avatarUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${holder.publicKey}`;

          const inner = (
            <>
              {/* Rank */}
              <span className="w-8 text-center text-sm font-bold shrink-0">
                {rankEmoji(rank)}
              </span>

              {/* Avatar */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt=""
                className="h-7 w-7 rounded-full object-cover shrink-0 bg-caldera/20"
                loading="lazy"
              />

              {/* Handle + label */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate block">
                  {handle}
                </span>
                {label && (
                  <span className="text-[10px] text-caldera font-semibold uppercase tracking-wider">
                    {label}
                  </span>
                )}
              </div>

              {/* Coin count + USD value */}
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-text-primary">
                  {holder.balanceCoins.toFixed(4)} {tokenDisplay}
                </div>
                {holder.valueUSD > 0 && (
                  <div className="text-[10px] font-mono text-text-tertiary">
                    {formatCurrency(holder.valueUSD)}
                  </div>
                )}
              </div>
            </>
          );

          const className = `flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors ${
            isTop3
              ? "bg-caldera/5 border border-caldera/10"
              : "bg-surface-2"
          }`;

          return profileHref ? (
            <a
              key={holder.publicKey}
              href={profileHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${className} hover:opacity-90`}
            >
              {inner}
            </a>
          ) : (
            <div key={holder.publicKey} className={className}>
              {inner}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-text-faint text-center">
        Hold {tokenDisplay} to appear on this leaderboard
      </p>
    </div>
  );
}
