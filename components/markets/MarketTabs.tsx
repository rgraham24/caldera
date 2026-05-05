"use client";

import { useState, useEffect } from "react";
import type { CommentWithUser, Creator } from "@/types";
import { MarketComments } from "./MarketComments";
import { formatCurrency, cn } from "@/lib/utils";

type MarketTabsProps = {
  marketId: string;
  comments: CommentWithUser[];
  creator: Creator | null;
};

export function MarketTabs({ marketId, comments, creator }: MarketTabsProps) {
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
        <p className="py-8 text-center text-sm text-text-muted">
          Trade activity coming soon
        </p>
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
