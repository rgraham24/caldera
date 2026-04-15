"use client";

import { useState, useEffect } from "react";
import type { Creator } from "@/types";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { StakeModal } from "@/components/markets/StakeModal";
import { AddCreatorModal } from "@/components/shared/AddCreatorModal";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { Plus } from "lucide-react";

type LiveCoinData = {
  priceUSD: number;
  holders: number;
  profilePicUrl: string | null;
  desoUsername: string | null;
  live: boolean;
};

type TrendingCreatorCoinsProps = {
  creators: (Creator & { price_change_24h: number })[];
};

export function TrendingCreatorCoins({ creators }: TrendingCreatorCoinsProps) {
  const [liveData, setLiveData] = useState<Record<string, LiveCoinData>>({});
  const [stakeCreator, setStakeCreator] = useState<(Creator & { price_change_24h: number }) | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    creators.forEach((c) => {
      fetch(`/api/creators/${c.slug}/coin-data`)
        .then((r) => r.json())
        .then(({ data }) => {
          if (data) {
            setLiveData((prev) => ({ ...prev, [c.slug]: data }));
          }
        })
        .catch(() => {});
    });
  }, [creators]);

  if (creators.length === 0) return null;

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <h2 className="section-header">Trending Creators</h2>
        <span className="rounded-full border border-caldera/20 bg-caldera/5 px-2.5 py-0.5 text-[10px] font-medium text-caldera">
          Powered by DeSo
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {creators.map((creator) => {
          const isUp = creator.price_change_24h >= 0;
          const live = liveData[creator.slug];
          const price = live?.priceUSD ?? creator.creator_coin_price;
          const holders = live?.holders ?? creator.creator_coin_holders;
          const desoUser = live?.desoUsername ?? (creator as { deso_username?: string }).deso_username;
          const coinSymbol = desoUser || creator.creator_coin_symbol;
          const isLive = live?.live ?? false;

          return (
            <div
              key={creator.id}
              className="min-w-[240px] flex-shrink-0 rounded-2xl border border-border-subtle/30 border-t-cyan-500/20 bg-surface p-5 transition-all hover:border-border-visible/50"
            >
              <div className="mb-4 flex items-center gap-3">
                <CreatorAvatar creator={creator} size="md" />
                <div className="min-w-0">
                  <Link href={`/creators/${creator.slug}`} className="block truncate text-sm font-semibold text-text-primary hover:text-caldera transition-colors">
                    {creator.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-widest text-text-muted">${coinSymbol}</span>
                  </div>
                </div>
              </div>

              <div className="mb-2 flex items-center gap-2">
                <p className="font-display text-xl font-bold tracking-normal text-text-primary">
                  {desoUser ? formatCurrency(price) : "—"}
                </p>
                {isLive && (
                  <span className="flex items-center gap-1 text-[10px] text-yes">
                    <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
                    Live
                  </span>
                )}
              </div>

              {desoUser && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {isUp ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-yes" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 text-no" />
                      )}
                      <span
                        className={`font-mono text-sm font-semibold ${isUp ? "text-yes" : "text-no"}`}
                      >
                        {isUp ? "+" : ""}{creator.price_change_24h.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">
                      {holders.toLocaleString()} holders
                    </p>
                  </div>
                  {(creator.total_holder_earnings ?? 0) > 0 && (
                    <p className="mb-2 text-[10px] font-medium text-yes">
                      {formatCompactCurrency(creator.total_holder_earnings ?? 0)} earned by holders
                    </p>
                  )}
                  <button
                    onClick={() => setStakeCreator(creator)}
                    className="w-full text-left text-xs font-medium text-caldera transition-colors hover:text-caldera/80"
                  >
                    Buy ${coinSymbol}
                  </button>
                </>
              )}
            </div>
          );
        })}
        {/* Add Creator card */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex min-w-[200px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-visible/40 bg-transparent p-5 transition-colors hover:border-caldera/40 hover:bg-caldera/5"
        >
          <Plus className="h-6 w-6 text-text-muted" />
          <p className="text-sm font-medium text-text-muted">Add a Creator</p>
          <p className="text-[10px] text-text-faint">Know someone who should be here?</p>
        </button>
      </div>

      <AddCreatorModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      {stakeCreator && (
        <StakeModal
          creator={stakeCreator}
          isOpen={!!stakeCreator}
          onClose={() => setStakeCreator(null)}
          livePrice={liveData[stakeCreator.slug]?.priceUSD}
          desoUsername={liveData[stakeCreator.slug]?.desoUsername ?? (stakeCreator as { deso_username?: string }).deso_username}
          profilePicUrl={liveData[stakeCreator.slug]?.profilePicUrl}
        />
      )}
    </section>
  );
}
