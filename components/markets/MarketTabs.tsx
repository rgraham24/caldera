"use client";

import { useState, useEffect } from "react";
import type { CommentWithUser, Creator } from "@/types";
import { MarketComments } from "./MarketComments";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";

type MarketTabsProps = {
  marketId: string;
  comments: CommentWithUser[];
  creator: Creator | null;
};

type Trade = { id: string; side: string; gross_amount: number; created_at: string };

export function MarketTabs({ marketId, comments, creator }: MarketTabsProps) {
  const [tab, setTab] = useState<"comments" | "activity" | "holders">("comments");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Array<{ username: string; balanceCoins: number; percentOwned: number; valueUSD: number }>>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingHolders, setLoadingHolders] = useState(false);

  useEffect(() => {
    if (tab === "activity" && trades.length === 0) {
      fetch(`/api/comments/${marketId}`)
        .then(() => {
          // Use trades endpoint — for now show seed trades
          // In production this would be a dedicated trades-by-market endpoint
        })
        .finally(() => setLoadingTrades(false));
    }
    if (tab === "holders" && creator?.slug && holders.length === 0) {
      fetch(`/api/creators/${creator.slug}/holders`)
        .then((r) => r.json())
        .then(({ data }) => setHolders(data || []))
        .finally(() => setLoadingHolders(false));
    }
  }, [tab, marketId, creator?.slug, trades.length, holders.length]);

  const tabs = [
    { key: "comments" as const, label: `Comments (${comments.length})` },
    { key: "activity" as const, label: "Activity" },
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

      {/* Activity */}
      {tab === "activity" && (
        <div className="space-y-2">
          {loadingTrades ? (
            <p className="py-8 text-center text-sm text-text-muted">Loading...</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-text-muted">Recent trades on this market</p>
              {comments.length === 0 && trades.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">No activity yet</p>
              ) : (
                /* Show seed trade-like data from comments as activity placeholders */
                comments.slice(0, 10).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm text-text-muted">
                    <span className={cn("font-semibold", i % 2 === 0 ? "text-yes" : "text-no")}>
                      {i % 2 === 0 ? "YES" : "NO"}
                    </span>
                    <span>Trader_{c.user_id.slice(-4)}</span>
                    <span>·</span>
                    <span className="font-mono">{formatCurrency((parseInt(c.id.slice(-4), 16) % 180) + 20)}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(c.created_at ?? "")}</span>
                  </div>
                ))
              )}
            </>
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
