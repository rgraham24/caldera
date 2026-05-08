"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CommentWithUser, Creator } from "@/types";
import { MarketComments } from "./MarketComments";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";
import type { MarketActivityTrade } from "@/app/(main)/markets/[id]/market-detail-client";

type MarketTabsProps = {
  marketId: string;
  comments: CommentWithUser[];
  creator: Creator | null;
  trades: MarketActivityTrade[];
};

function isDesoPubkey(s: string | null | undefined): boolean {
  return Boolean(s && s.startsWith("BC1") && s.length > 40);
}
function shortenPubkey(s: string): string {
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export function MarketTabs({ marketId, comments, creator, trades }: MarketTabsProps) {
  const [tab, setTab] = useState<"comments" | "activity" | "holders">("comments");
  const [holders, setHolders] = useState<Array<{ username: string; balanceCoins: number; percentOwned: number; valueUSD: number }>>([]);
  const [loadingHolders, setLoadingHolders] = useState(false);

  useEffect(() => {
    if (tab === "holders" && creator?.slug && holders.length === 0) {
      fetch(`/api/creators/${creator.slug}/holders`)
        .then((r) => r.json())
        .then(({ data }) => setHolders(data || []))
        .finally(() => setLoadingHolders(false));
    }
  }, [tab, creator?.slug, holders.length]);

  const tabs = [
    { key: "comments" as const, label: `Comments (${comments.length})` },
    { key: "activity" as const, label: `Activity${trades.length > 0 ? ` (${trades.length})` : ""}` },
    ...(creator ? [{ key: "holders" as const, label: "Top Holders" }] : []),
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 border-b border-border-subtle/30">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-b-2 border-caldera text-caldera"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Comments */}
      {tab === "comments" && (
        <MarketComments marketId={marketId} initialComments={comments} />
      )}

      {/* Activity — chronological trades for this market */}
      {tab === "activity" && (
        <div>
          {trades.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No trades yet. Be the first.
            </p>
          ) : (
            <div className="space-y-3">
              {trades.map((t) => {
                const sideUpper = t.side.toUpperCase();
                const isYes = t.side === "yes";
                const action = t.action_type === "sell" ? "sold" : "bought";
                const cents = Math.round((t.price ?? 0) * 100);
                const amountUsd = formatCurrency(t.gross_amount ?? 0);
                const rawUsername = t.user?.username ?? "";
                const fallbackName = isDesoPubkey(rawUsername)
                  ? shortenPubkey(rawUsername)
                  : rawUsername || "Anonymous";
                const displayName = t.creator?.name ?? fallbackName;
                const avatarUrl = t.creator?.image_url ?? t.user?.avatar_url ?? null;
                const profileHref = t.creator ? `/creators/${t.creator.slug}` : null;

                const headerInner = (
                  <>
                    {avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[var(--bg-elevated)]" />
                    )}
                    <span className="text-sm font-medium text-text-primary">
                      {displayName}
                    </span>
                  </>
                );

                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-2.5"
                  >
                    {profileHref ? (
                      <Link
                        href={profileHref}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
                      >
                        {headerInner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">{headerInner}</div>
                    )}
                    <span className="flex-1 text-sm text-text-muted">
                      {action}{" "}
                      <span
                        className={cn(
                          "font-mono font-semibold tabular-nums",
                          isYes ? "text-yes" : "text-no"
                        )}
                      >
                        {cents}¢ {sideUpper}
                      </span>
                      {" · "}
                      <span className="font-mono tabular-nums text-text-primary">
                        {amountUsd}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted shrink-0">
                      {formatRelativeTime(t.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Top Holders */}
      {tab === "holders" && creator && (
        <div>
          <p className="mb-3 text-xs text-text-muted">
            Top holders of ${creator.deso_username || creator.creator_coin_symbol}
          </p>
          {loadingHolders ? (
            <p className="py-8 text-center text-sm text-text-muted">Loading from DeSo...</p>
          ) : holders.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No holders found</p>
          ) : (
            <div className="rounded-xl border border-border-subtle/30 bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-text-muted">
                    <th className="px-4 py-2.5 text-left font-medium w-12">#</th>
                    <th className="px-4 py-2.5 text-left font-medium">Holder</th>
                    <th className="px-4 py-2.5 text-right font-medium">Coins</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">% Supply</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h, i) => (
                    <tr key={i} className="border-b border-border-subtle/20 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5 font-mono text-text-muted">
                        {i === 0 ? "👑" : i + 1}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-text-primary">
                        {h.username}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-muted">
                        {h.balanceCoins.toFixed(4)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {formatCurrency(h.valueUSD)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-muted">
                        {h.percentOwned.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-caldera">
            Fees flow back into ${creator.deso_username || creator.creator_coin_symbol} from every trade on this market →
          </p>
        </div>
      )}
    </div>
  );
}
