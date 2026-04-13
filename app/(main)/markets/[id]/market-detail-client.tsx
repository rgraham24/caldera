"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store";
import { useDesoBalance } from "@/hooks/useDesoBalance";
import type { Market, CommentWithUser, Creator, MarketOutcome } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { MarketStatusBadge } from "@/components/markets/MarketStatusBadge";
import { MarketChart } from "@/components/markets/MarketChart";
import { PriceChart } from "@/components/markets/PriceChart";
import { TradeTicket } from "@/components/markets/TradeTicket";
import { MarketTabs } from "@/components/markets/MarketTabs";
import { MarketCard } from "@/components/markets/MarketCard";
import { WatchlistButton } from "@/components/shared/WatchlistButton";
import { CreatorCoinExplainer } from "@/components/markets/CreatorCoinExplainer";
import { CryptoRealTimeChart } from "@/components/markets/CryptoRealTimeChart";
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

function getCategoryTokenDisplay(category: string, cryptoTicker?: string | null, creatorSlug?: string | null): string {
  if (cryptoTicker && creatorSlug) return `$${creatorSlug}`;
  const map: Record<string, string> = {
    Sports: '$caldera-sports',
    Music: '$caldera-music',
    Politics: '$caldera-politics',
    Entertainment: '$caldera-entertainment',
    Companies: '$caldera-companies',
    Climate: '$caldera-climate',
    Tech: '$caldera-tech',
  };
  return map[category] || '$caldera-creators';
}

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
  const [news, setNews] = useState<Array<{ title: string; url: string; source: string; age: string }>>([]);
  const [copied, setCopied] = useState(false);
  // Crypto 5-min market live state
  const [cryptoPrice, setCryptoPrice] = useState<number | null>(null);
  const [cryptoPriceChange, setCryptoPriceChange] = useState<'up' | 'down' | null>(null);
  const [cryptoTimeLeft, setCryptoTimeLeft] = useState('');
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

  // Fetch related news headlines
  useEffect(() => {
    if (!market?.id) return;
    fetch(`/api/markets/${market.id}/news`)
      .then((r) => r.json())
      .then((d: { articles?: Array<{ title: string; url: string; source: string; age: string }> }) => setNews(d.articles ?? []))
      .catch(() => {});
  }, [market?.id]);

  // Active balance polling (10s) on trade page — immediate refresh after trade
  const { refresh: refreshBalance } = useDesoBalance(
    isConnected ? desoPublicKey : null,
    (nanos, usd) => setDesoBalance(nanos, usd),
    true
  );

  // Crypto market: price update callback from chart
  const handleCryptoPriceUpdate = useCallback((price: number, change: 'up' | 'down' | null) => {
    setCryptoPrice(price);
    setCryptoPriceChange(change);
  }, []);

  // Crypto market: countdown timer
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolveAt = (market as any).auto_resolve_at as string | undefined;
    if (!resolveAt) return;
    function tick() {
      const diff = new Date(resolveAt!).getTime() - Date.now();
      if (diff <= 0) { setCryptoTimeLeft('Resolving…'); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCryptoTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [market]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoTicker = (market as any).crypto_ticker as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoTargetPrice = (market as any).crypto_target_price as number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoResolveAt = (market as any).auto_resolve_at as string | undefined;

  const yesPercent = Math.round((market.yes_price ?? 0) * 100);
  const isResolved = market.status === "resolved";

  const handleShare = () => {
    const text = `${market.title}\n\n${yesPercent}% chance YES on @CalderaMarket\n\ncaldera.market/markets/${market.slug}`;
    const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(tweetUrl, '_blank', 'width=550,height=420');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://caldera.market/markets/' + market.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Polymarket-style crypto 5-min layout ─────────────────────────────────────
  if (cryptoTicker && cryptoTargetPrice && autoResolveAt) {
    const isAbove = (cryptoPrice ?? 0) > cryptoTargetPrice;
    const diffPct = cryptoPrice
      ? ((cryptoPrice - cryptoTargetPrice) / cryptoTargetPrice) * 100
      : 0;

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left — title + chart card with price header inside */}
          <div className="flex-1 min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CategoryPill category={market.category} />
              <MarketStatusBadge status={market.status} />
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary md:text-2xl mb-4">
              {market.title}
            </h1>

            {/* Chart card — price header + chart in one card */}
            <div className="rounded-xl border border-border-subtle bg-surface p-4 mb-4">
              {/* Price header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                      {cryptoTicker} / USD
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-4xl font-bold font-mono transition-colors duration-300 ${
                      cryptoPriceChange === 'up' ? 'text-yes' :
                      cryptoPriceChange === 'down' ? 'text-no' : 'text-text-primary'
                    }`}>
                      {cryptoPrice
                        ? `$${cryptoPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : <span className="text-2xl text-text-muted animate-pulse">Loading…</span>}
                    </span>
                    {cryptoPrice && (
                      <span className={`text-sm font-semibold ${isAbove ? 'text-yes' : 'text-no'}`}>
                        {isAbove ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-text-muted">
                      Target:{' '}
                      <span className="text-text-primary font-medium font-mono">
                        ${cryptoTargetPrice.toLocaleString('en-US', { minimumFractionDigits: cryptoTargetPrice < 1 ? 4 : 2, maximumFractionDigits: cryptoTargetPrice < 1 ? 4 : 2 })}
                      </span>
                    </span>
                    {cryptoPrice && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isAbove ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no'}`}>
                        {isAbove ? '▲ ABOVE' : '▼ BELOW'} TARGET
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-mono font-bold text-text-primary">{cryptoTimeLeft || '—'}</div>
                  <div className="text-xs text-text-muted">remaining</div>
                </div>
              </div>

              {/* Chart */}
              <div className="relative">
                <CryptoRealTimeChart
                  ticker={cryptoTicker}
                  targetPrice={cryptoTargetPrice}
                  onPriceUpdate={handleCryptoPriceUpdate}
                />
                {market.status === 'resolved' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/70 backdrop-blur-sm rounded-xl z-10">
                    <span className="text-4xl mb-2">
                      {market.resolution_outcome === 'yes' ? '✅' : '❌'}
                    </span>
                    <p className="text-base font-bold text-text-primary">
                      Resolved {market.resolution_outcome?.toUpperCase()}
                    </p>
                    <p className="text-xs text-text-muted mt-1">Market closed</p>
                  </div>
                )}
              </div>
            </div>

            <MarketTabs marketId={market.id} comments={comments} creator={creator} />
          </div>

          {/* Right — trade panel only */}
          <div className="w-full lg:w-80 shrink-0 sticky top-20">
            <div className="space-y-4">
              {market.status === 'open' && (
                <TradeTicket
                  market={market}
                  feeConfig={feeConfig}
                  onTradeComplete={refreshBalance}
                  selectedOutcome={null}
                />
              )}

              {(() => {
                const burnToken = getCategoryTokenDisplay(market.category, market.crypto_ticker, market.creator_slug);
                const burnSlug = burnToken.replace('$', '');
                return (
                  <div className="text-center">
                    <a
                      href={`/creators/${burnSlug}`}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      View {burnToken} token →
                    </a>
                  </div>
                );
              })()}

              <div className="flex items-center justify-center gap-3">
                <WatchlistButton entityType="market" entityId={market.id} />
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors border border-border rounded-lg px-3 py-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Share
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors border border-border rounded-lg px-3 py-1.5"
                >
                  {copied ? '✓ Copied' : '🔗 Copy Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

          {/* Related news */}
          {news.length > 0 && (
            <div className="mt-4 mb-6 space-y-2">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Related News
              </h3>
              {news.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-surface-2 transition-colors group"
                  style={{ border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2 group-hover:text-caldera transition-colors">
                      {article.title}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {article.source}{article.age && ` · ${article.age}`}
                    </div>
                  </div>
                  <div className="text-text-muted shrink-0 mt-0.5">→</div>
                </a>
              ))}
            </div>
          )}

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
                  Active holders: {(creator.creator_coin_holders ?? 0).toLocaleString()}
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
              <PriceChart
                marketId={market.id}
                currentYesPrice={market.yes_price ?? 0.5}
                currentNoPrice={market.no_price ?? 0.5}
              />
            </div>
          )}

          {/* Stats row */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Volume</p>
              <p className="font-mono text-lg font-semibold text-text-primary">
                {formatCompactCurrency(market.total_volume ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Liquidity</p>
              <p className="font-mono text-lg font-semibold text-text-primary">
                {formatCompactCurrency(market.liquidity ?? 0)}
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
              <TradeTicket market={market} feeConfig={feeConfig} onTradeComplete={refreshBalance} selectedOutcome={selectedOutcome} />
            )}

            <div className="flex items-center justify-center gap-3">
              <WatchlistButton entityType="market" entityId={market.id} />
              <div className="flex gap-2">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors border border-border rounded-lg px-3 py-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Share
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors border border-border rounded-lg px-3 py-1.5"
                >
                  {copied ? '✓ Copied' : '🔗 Copy Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
