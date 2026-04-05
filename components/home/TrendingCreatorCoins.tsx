"use client";

import { useState, useEffect } from "react";
import type { Creator } from "@/types";
import { formatCurrency } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";

const AVATAR_GRADIENTS = [
  "from-cyan-500/30 to-blue-600/30",
  "from-violet-500/30 to-purple-600/30",
  "from-emerald-500/30 to-teal-600/30",
  "from-rose-500/30 to-pink-600/30",
  "from-amber-500/30 to-orange-600/30",
  "from-blue-500/30 to-indigo-600/30",
  "from-pink-500/30 to-fuchsia-600/30",
  "from-teal-500/30 to-cyan-600/30",
];
const AVATAR_TEXT = [
  "text-cyan-300", "text-violet-300", "text-emerald-300", "text-rose-300",
  "text-amber-300", "text-blue-300", "text-pink-300", "text-teal-300",
];

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

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
        <h2 className="section-header">Trending Stakes</h2>
        <span className="rounded-full border border-caldera/20 bg-caldera/5 px-2.5 py-0.5 text-[10px] font-medium text-caldera">
          Powered by DeSo
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {creators.map((creator) => {
          const isUp = creator.price_change_24h >= 0;
          const idx = nameHash(creator.name) % AVATAR_GRADIENTS.length;
          const live = liveData[creator.slug];
          const price = live?.priceUSD ?? creator.creator_coin_price;
          const holders = live?.holders ?? creator.creator_coin_holders;
          const picUrl = live?.profilePicUrl;
          const desoUser = live?.desoUsername ?? (creator as { deso_username?: string }).deso_username;
          const coinSymbol = desoUser || creator.creator_coin_symbol;
          const isLive = live?.live ?? false;

          return (
            <div
              key={creator.id}
              className="min-w-[240px] flex-shrink-0 rounded-2xl border border-border-subtle/30 border-t-cyan-500/20 bg-surface p-5 transition-all hover:border-border-visible/50"
            >
              <div className="mb-4 flex items-center gap-3">
                {picUrl ? (
                  <img
                    src={picUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[idx]} ${AVATAR_TEXT[idx]} text-base font-bold`}>
                    {creator.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  {desoUser ? (
                    <a
                      href={`https://diamondapp.com/u/${desoUser}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-text-primary hover:text-caldera transition-colors"
                    >
                      {creator.name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {creator.name}
                    </p>
                  )}
                  <p className="text-[10px] tracking-widest text-text-muted">
                    ${coinSymbol}
                  </p>
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

              {!desoUser ? (
                <p className="mb-4 text-xs text-text-faint">Stake not yet available</p>
              ) : (
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
                  <a
                    href={`https://diamondapp.com/u/${desoUser}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-4 flex items-center gap-1 text-[10px] text-text-muted hover:text-caldera transition-colors"
                  >
                    Tradeable on DeSo blockchain
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="w-full text-left text-xs font-medium text-caldera transition-colors hover:text-caldera/80">
                    Earn 0.75% from trades →
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs bg-surface border-border-subtle text-text-primary">
                    <p className="text-xs">
                      Hold a stake in ${coinSymbol} to earn 0.75% of every trade on {creator.name}&apos;s markets
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}
      </div>
    </section>
  );
}
