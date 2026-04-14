"use client";

// Requires this table in Supabase (run once):
//
// CREATE TABLE IF NOT EXISTS creator_coin_holders (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   creator_slug text NOT NULL REFERENCES creators(slug) ON DELETE CASCADE,
//   deso_public_key text NOT NULL,
//   deso_username text,
//   coins_held numeric NOT NULL DEFAULT 0,
//   updated_at timestamptz DEFAULT now(),
//   UNIQUE(creator_slug, deso_public_key)
// );
// CREATE INDEX ON creator_coin_holders(creator_slug, coins_held DESC);

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Holder = {
  deso_public_key: string;
  deso_username: string | null;
  coins_held: number;
  rank: number;
};

type Props = {
  creatorSlug: string;
  coinSymbol: string;
};

export function HolderLeaderboard({ creatorSlug, coinSymbol }: Props) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("creator_coin_holders")
      .select("deso_public_key, deso_username, coins_held")
      .eq("creator_slug", creatorSlug)
      .order("coins_held", { ascending: false })
      .limit(10)
      .then(({ data }: { data: Omit<Holder, "rank">[] | null }) => {
        if (data) {
          setHolders(data.map((h, i) => ({ ...h, rank: i + 1 })));
        }
        setLoading(false);
      });
  }, [creatorSlug]);

  if (loading) {
    return (
      <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
        <h2 className="section-header mb-4">On-Chain Holders</h2>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-surface-2 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (holders.length === 0) {
    return (
      <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
        <h2 className="section-header mb-2">On-Chain Holders</h2>
        <p className="text-sm text-text-muted">
          No holders yet — be the first to buy ${coinSymbol}.
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
        <h2 className="section-header">On-Chain Holders</h2>
        <span className="text-xs text-text-muted">${coinSymbol} holders</span>
      </div>

      <div className="space-y-2">
        {holders.map((holder) => {
          const handle = holder.deso_username
            ? `@${holder.deso_username}`
            : `${holder.deso_public_key.slice(0, 8)}...`;
          const label = rankLabel(holder.rank);
          const isTop3 = holder.rank <= 3;

          return (
            <div
              key={holder.deso_public_key}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors ${
                isTop3
                  ? "bg-caldera/5 border border-caldera/10"
                  : "bg-surface-2"
              }`}
            >
              {/* Rank */}
              <span className="w-8 text-center text-sm font-bold shrink-0">
                {rankEmoji(holder.rank)}
              </span>

              {/* Avatar placeholder */}
              <div className="h-7 w-7 rounded-full bg-caldera/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-caldera">
                  {(holder.deso_username ?? "?").charAt(0).toUpperCase()}
                </span>
              </div>

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

              {/* Coin count */}
              <span className="text-xs font-mono text-text-muted shrink-0">
                {holder.coins_held.toFixed(4)}{" "}
                <span className="text-text-faint">${coinSymbol}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-text-faint text-center">
        Hold ${coinSymbol} to appear on this leaderboard
      </p>
    </div>
  );
}
