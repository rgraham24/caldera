"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { useDesoBalance } from "@/hooks/useDesoBalance";
import type { Market, CommentWithUser, Creator, MarketOutcome } from "@/types";
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
  const [selectedOutcome, setSelectedOutcome] = useState<MarketOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<MarketOutcome[]>([]);
  const { desoPublicKey, isConnected, setDesoBalance } = useAppStore();

  // Fetch categorical outcomes client-side when needed
  useEffect(() => {
    if (market.market_type !== "categorical") return;
    fetch(`/api/markets/categorical?market_id=${market.id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.market_outcomes)) {
          setOutcomes(data[0].market_outcomes as MarketOutcome[]);
        }
      })
      .catch(() => {});
  }, [market.id, market.market_type]);

  // Active balance polling (10s) on trade page — immediate refresh after trade
  const { refresh: refreshBalance } = useDesoBalance(
    isConnected ? desoPublicKey : null,
    (nanos, usd) => setDesoBalance(nanos, usd),
    true
  );

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

          {/* Unclaimed token banner */}
          {creator && (creator.token_status === "shadow" || creator.token_status === "needs_review" || !creator.token_status) && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-400">
                <span className="font-semibold">${creator.deso_username ?? creator.creator_coin_symbol ?? creator.slug}</span> token unclaimed — {creator.name} could be earning from this market
              </p>
              <a
                href={`/creators/${creator.slug}`}
                className="shrink-0 text-xs font-semibold text-amber-400 hover:text-amber-300 whitespace-nowrap"
              >
                Claim →
              </a>
            </div>
          )}

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

          {/* Big probability / categorical outcomes */}
          <div className="mb-6">
            {market.market_type === "categorical" && outcomes.length > 0 ? (
              <div>
                <p className="mb-3 text-sm font-medium text-text-muted">Select an outcome to trade</p>
                <div className="space-y-2">
                  {[...outcomes]
                    .sort((a, b) => b.probability - a.probability)
                    .map((outcome) => (
                      <div
                        key={outcome.id}
                        onClick={() => setSelectedOutcome(outcome)}
                        className="flex items-center justify-between rounded-xl p-3 cursor-pointer transition-colors"
                        style={{
                          border: selectedOutcome?.id === outcome.id
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border-subtle)",
                          background: selectedOutcome?.id === outcome.id
                            ? "rgba(249,115,22,0.05)"
                            : "var(--bg-surface)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {outcome.image_url && (
                            <img
                              src={outcome.image_url}
                              alt={outcome.label}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-text-primary">{outcome.label}</div>
                            {outcome.creator_slug && (
                              <div className="text-xs text-caldera">${outcome.creator_slug}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-text-primary">
                              {Math.round(outcome.probability * 100)}%
                            </div>
                            <div className="text-[10px] text-text-muted">chance</div>
                          </div>
                          <div className="flex gap-1">
                            <button className="text-[10px] font-semibold bg-yes text-white rounded-lg px-2 py-1 hover:bg-yes/90 transition-colors">
                              YES {Math.round(outcome.probability * 100)}¢
                            </button>
                            <button className="text-[10px] font-semibold bg-no/20 text-no rounded-lg px-2 py-1 hover:bg-no/30 transition-colors">
                              NO {Math.round((1 - outcome.probability) * 100)}¢
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                {selectedOutcome && (
                  <p className="mt-3 text-xs text-text-muted">
                    Selected: <span className="font-semibold text-text-primary">{selectedOutcome.label}</span> — use the trading panel to confirm.
                  </p>
                )}
              </div>
            ) : isResolved ? (
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-display text-6xl font-bold tracking-tight ${
                    market.resolution_outcome === "yes" ? "text-yes" : "text-no"
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
              <TradeTicket market={market} feeConfig={feeConfig} onTradeComplete={refreshBalance} />
            )}

            <div className="flex items-center justify-center gap-3">
              <WatchlistButton entityType="market" entityId={market.id} />
              <ShareCard market={market} creatorName={creator?.name} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
