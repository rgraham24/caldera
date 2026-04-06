"use client";

import { useState } from "react";
import Link from "next/link";
import type { Market, CommentWithUser, Creator } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { MarketStatusBadge } from "@/components/markets/MarketStatusBadge";
import { MarketChart } from "@/components/markets/MarketChart";
import { TradeTicket } from "@/components/markets/TradeTicket";
import { MarketTabs } from "@/components/markets/MarketTabs";
import { MarketCard } from "@/components/markets/MarketCard";
import { WatchlistButton } from "@/components/shared/WatchlistButton";
import { CreatorCoinExplainer } from "@/components/markets/CreatorCoinExplainer";
import { ShareCard } from "@/components/shared/ShareCard";
import {
  formatCompactCurrency,
  formatCurrency,
  formatRelativeTime,
} from "@/lib/utils";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type MarketDetailClientProps = {
  market: Market;
  comments: CommentWithUser[];
  relatedMarkets: Market[];
  feeConfig: Record<string, string>;
  creator: Creator | null;
};

export function MarketDetailClient({
  market,
  comments,
  relatedMarkets,
  feeConfig,
  creator,
}: MarketDetailClientProps) {
  const [rulesOpen, setRulesOpen] = useState(false);

  const yesPercent = Math.round(market.yes_price * 100);
  const isResolved = market.status === "resolved";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left column (65%) */}
        <div className="flex-1 lg:max-w-[65%]">
          {/* Header */}
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CategoryPill category={market.category} />
              <MarketStatusBadge status={market.status} />
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
              {market.title}
            </h1>
            {market.description && (
              <p className="mt-2 text-sm text-text-muted leading-relaxed">
                {market.description}
              </p>
            )}
          </div>

          {/* Creator stake explainer */}
          {creator && (
            <div className="mb-6">
              <CreatorCoinExplainer
                creator={creator}
                creatorFeePercent={parseFloat(feeConfig.creator_market_creator_fee || "0.01")}
              />
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                <span className="text-xs text-caldera font-medium">
                  Active holders: {creator.creator_coin_holders.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Big probability */}
          <div className="mb-6">
            {isResolved ? (
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-display text-6xl font-bold tracking-tight ${
                    market.resolution_outcome === "yes"
                      ? "text-yes"
                      : "text-no"
                  }`}
                >
                  {market.resolution_outcome?.toUpperCase()}
                </span>
                <span className="text-text-muted text-sm">Resolved</span>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-display text-6xl font-bold tracking-tight ${
                    yesPercent >= 50 ? "text-yes" : "text-no"
                  }`}
                >
                  {yesPercent}%
                </span>
                <span className="text-xs uppercase tracking-widest text-text-muted">
                  chance of YES
                </span>
              </div>
            )}
          </div>

          {/* Chart */}
          {!isResolved && (
            <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
              <MarketChart yesPrice={market.yes_price} />
            </div>
          )}

          {/* Stats row */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Volume</p>
              <p className="font-mono text-lg font-semibold text-text-primary">
                {formatCompactCurrency(market.total_volume)}
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Liquidity</p>
              <p className="font-mono text-lg font-semibold text-text-primary">
                {formatCompactCurrency(market.liquidity)}
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
              <p className="text-xs text-text-muted mb-1">
                {isResolved ? "Resolved" : "Resolves"}
              </p>
              <p className="text-sm font-medium text-text-primary">
                {market.resolve_at
                  ? formatRelativeTime(market.resolve_at)
                  : "TBD"}
              </p>
            </div>
          </div>

          {/* Resolution Criteria */}
          {(market.resolution_criteria || market.rules_text) && (
            <div className="mb-6 rounded-xl border border-border-subtle bg-surface">
              <button
                onClick={() => setRulesOpen(!rulesOpen)}
                className="flex w-full items-center justify-between p-4 text-sm font-medium text-text-primary"
              >
                Resolution Criteria
                {rulesOpen ? (
                  <ChevronUp className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                )}
              </button>
              {rulesOpen && (
                <div className="border-t border-border-subtle p-4 space-y-3">
                  {market.resolution_criteria && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">Resolves YES when</p>
                      <p className="text-sm text-text-primary leading-relaxed">
                        {market.resolution_criteria}
                      </p>
                    </div>
                  )}
                  {market.resolution_source && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">Verification Source</p>
                      <p className="text-sm text-caldera">{market.resolution_source}</p>
                    </div>
                  )}
                  {market.rules_text && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">Rules</p>
                      <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                        {market.rules_text}
                      </p>
                    </div>
                  )}
                  {market.resolution_source_url && (
                    <a
                      href={market.resolution_source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-caldera hover:underline"
                    >
                      External Source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Related markets */}
          {relatedMarkets.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-4 font-display text-base font-semibold text-text-primary">
                Related Markets
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {relatedMarkets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <MarketTabs marketId={market.id} comments={comments} creator={creator} />
        </div>

        {/* Right column (35%) — sticky trading panel */}
        <div className="w-full lg:w-[35%]">
          <div className="sticky top-20 space-y-4">
            {market.status === "open" && (
              <TradeTicket market={market} feeConfig={feeConfig} />
            )}

            <div className="flex items-center justify-center gap-3">
              <WatchlistButton entityType="market" entityId={market.id} />
              <ShareCard market={market} creatorName={creator?.name} />
            </div>
            <Link href="/caldra" className="mt-3 block text-center text-[10px] text-caldera hover:text-caldera/80">
              Hold $CALDRA to earn from this and every other market →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
