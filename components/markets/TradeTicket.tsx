"use client";

import { useState, useMemo, useEffect } from "react";
import type { Market, MarketOutcome } from "@/types";
import { getTradeQuote } from "@/lib/trading/amm";
import { calculateFees, getMarketFeeType } from "@/lib/fees/calculator";
import { formatCurrency, formatPercentDecimal, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore } from "@/store";
import { Info } from "lucide-react";
import { connectDeSoWallet, sendDesoPayment } from "@/lib/deso/auth";

type TradeTicketProps = {
  market: Market;
  feeConfig: Record<string, string>;
  onTradeComplete?: () => void;
  selectedOutcome?: MarketOutcome | null;
};

type UserPosition = {
  side: "yes" | "no";
  shares: number;
  avgPrice: number;
  totalCost: number;
  unrealizedPnl: number;
} | null;

function getCategoryTokenSlug(category: string, cryptoTicker?: string | null, creatorSlug?: string | null): string {
  if (cryptoTicker && creatorSlug) return creatorSlug;
  const map: Record<string, string> = {
    Sports: 'caldera-sports',
    Music: 'caldera-music',
    Politics: 'caldera-politics',
    Entertainment: 'caldera-entertainment',
    Companies: 'caldera-companies',
    Climate: 'caldera-climate',
    Tech: 'caldera-tech',
  };
  return map[category] || 'caldera-creators';
}

function getCategoryTokenDisplay(category: string, cryptoTicker?: string | null, creatorSlug?: string | null): string {
  const slug = getCategoryTokenSlug(category, cryptoTicker, creatorSlug);
  return '$' + slug.replace('caldera-', '').toUpperCase();
}

export function TradeTicket({
  market,
  feeConfig,
  onTradeComplete,
  selectedOutcome,
}: TradeTicketProps) {
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [sellShares, setSellShares] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<{ shares: number; side: string; mode: "buy" | "sell" } | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition>(null);
  const [positionFetching, setPositionFetching] = useState(false);
  const { isConnected, desoPublicKey } = useAppStore();

  const amountNum = parseFloat(amount) || 0;
  const sellSharesNum = parseFloat(sellShares) || 0;

  // Fetch position when sell tab is active
  useEffect(() => {
    if (tradeMode !== "sell" || !desoPublicKey || !market.id) {
      setUserPosition(null);
      return;
    }
    setPositionFetching(true);
    fetch(`/api/positions?marketId=${market.id}&desoPublicKey=${desoPublicKey}`)
      .then((r) => r.json())
      .then((d) => {
        setUserPosition(d.data ?? null);
        setPositionFetching(false);
        // Pre-fill side based on position
        if (d.data?.side) setSide(d.data.side);
      })
      .catch(() => setPositionFetching(false));
  }, [tradeMode, desoPublicKey, market.id]);

  const quote = useMemo(() => {
    if (tradeMode !== "buy" || amountNum <= 0) return null;
    try {
      const feeType = getMarketFeeType(market);
      const fees = calculateFees(amountNum, feeType, feeConfig);
      const tradeQuote = getTradeQuote(
        { yesPool: market.yes_pool ?? 0, noPool: market.no_pool ?? 0 },
        side,
        fees.netAmount
      );
      return { ...tradeQuote, fees };
    } catch {
      return null;
    }
  }, [amountNum, side, market, feeConfig, tradeMode]);

  // Estimated sell return (rough AMM calc)
  const sellEstimate = useMemo(() => {
    if (tradeMode !== "sell" || sellSharesNum <= 0 || !userPosition) return null;
    const currentPrice = userPosition.side === "yes"
      ? (market.yes_price ?? 0.5)
      : (market.no_price ?? 0.5);
    return sellSharesNum * currentPrice;
  }, [tradeMode, sellSharesNum, userPosition, market.yes_price, market.no_price]);

  const handleTrade = async () => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }

    if (tradeMode === "buy") {
      if (!quote || amountNum <= 0) return;
    } else {
      if (sellSharesNum <= 0) return;
    }

    setIsSubmitting(true);
    setError(null);
    setTradeStatus(null);

    try {
      if (tradeMode === "buy") {
        const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET;
        const currentDesoPublicKey = desoPublicKey ?? useAppStore.getState().desoPublicKey;

        let txnHash: string | undefined;

        if (platformWallet && currentDesoPublicKey) {
          const priceRes = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
          const priceData = await priceRes.json();
          const centsPerDeso = priceData.USDCentsPerDeSoExchangeRate ?? priceData.USDCentsPerDeSoCoin ?? 0;
          const desoUsdRate = centsPerDeso > 0 ? centsPerDeso / 100 : 0;

          if (desoUsdRate > 0) {
            const amountNanos = Math.floor((amountNum / desoUsdRate) * 1e9);
            setTradeStatus('Waiting for wallet approval...');
            const hash = await sendDesoPayment(currentDesoPublicKey, platformWallet, amountNanos);
            if (!hash) throw new Error('Transaction cancelled or failed');
            txnHash = hash;
            setTradeStatus('Recording trade...');
          }
        }

        const res = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: market.id,
            side,
            amount: amountNum,
            txnHash,
            desoPublicKey: desoPublicKey ?? useAppStore.getState().desoPublicKey,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Trade failed");

        const shares = data?.data?.quote?.sharesReceived ?? quote?.sharesReceived ?? 0;
        setTradeStatus(null);
        setTradeSuccess({ shares, side, mode: "buy" });
        setAmount("");
        onTradeComplete?.();
        setTimeout(() => setTradeSuccess(null), 4000);
      } else {
        // Sell
        if (!userPosition) throw new Error("No position to sell");

        const res = await fetch("/api/trades/sell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: market.id,
            side: userPosition.side,
            shares: sellSharesNum,
            desoPublicKey: desoPublicKey ?? useAppStore.getState().desoPublicKey,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sell failed");

        setTradeStatus(null);
        setTradeSuccess({ shares: sellSharesNum, side: userPosition.side, mode: "sell" });
        setSellShares("");
        onTradeComplete?.();
        // Refresh position
        setUserPosition(null);
        setTimeout(() => setTradeSuccess(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
      setTradeStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCategorical = market.market_type === "categorical";
  const yesPrice = isCategorical && selectedOutcome
    ? selectedOutcome.probability
    : market.yes_price ?? 0;
  const noPrice = isCategorical && selectedOutcome
    ? 1 - selectedOutcome.probability
    : 1 - yesPrice;

  return (
    <>
    <div className="relative trade-panel-glow rounded-2xl border border-cyan-500/20 bg-surface p-5">
      {/* Categorical: no outcome selected yet */}
      {isCategorical && !selectedOutcome ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          ← Select an outcome to trade
        </div>
      ) : (
      <>
      {/* Categorical: selected outcome header */}
      {isCategorical && selectedOutcome && (
        <div className="mb-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="text-xs text-orange-400 font-medium">Trading on</div>
          <div className="text-sm font-semibold">{selectedOutcome.label}</div>
          {selectedOutcome.creator_slug && (
            <div className="text-xs text-muted-foreground">${selectedOutcome.creator_slug} gets auto-buyback</div>
          )}
        </div>
      )}

      {/* Buy / Sell mode tabs */}
      {!isCategorical && market.status === "open" && (
        <div className="mb-4 flex rounded-lg bg-background p-1 gap-1">
          <button
            onClick={() => { setTradeMode("buy"); setError(null); }}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors",
              tradeMode === "buy"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            Buy
          </button>
          <button
            onClick={() => { setTradeMode("sell"); setError(null); }}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors",
              tradeMode === "sell"
                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            Sell
          </button>
        </div>
      )}

      {/* ── SELL mode ── */}
      {tradeMode === "sell" && !isCategorical && (
        <div className="mb-4">
          {positionFetching ? (
            <p className="text-xs text-text-muted py-4 text-center">Loading your position…</p>
          ) : !isConnected ? (
            <p className="text-xs text-text-muted py-4 text-center">Connect wallet to see your position.</p>
          ) : !userPosition ? (
            <p className="text-xs text-text-muted py-4 text-center">You have no open position in this market.</p>
          ) : (
            <>
              {/* Position info */}
              <div className="mb-3 rounded-xl bg-background border border-border-subtle p-3 text-xs space-y-1.5">
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-2">Your Position</p>
                <div className="flex justify-between">
                  <span className="text-text-muted">Side</span>
                  <span className={cn("font-semibold font-mono", userPosition.side === "yes" ? "text-yes" : "text-no")}>
                    {userPosition.side.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Shares</span>
                  <span className="font-mono text-text-primary">{userPosition.shares.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Avg entry</span>
                  <span className="font-mono text-text-primary">{(userPosition.avgPrice * 100).toFixed(1)}¢</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Total cost</span>
                  <span className="font-mono text-text-primary">{formatCurrency(userPosition.totalCost)}</span>
                </div>
              </div>

              {/* Shares to sell input */}
              <label className="mb-1.5 block text-xs text-text-muted">Shares to sell</label>
              <div className="relative mb-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  max={userPosition.shares}
                  value={sellShares}
                  onChange={(e) => setSellShares(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border-subtle bg-background py-2.5 px-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-no focus:outline-none focus:ring-1 focus:ring-no"
                />
              </div>
              {/* Quick % buttons */}
              <div className="flex gap-2 mb-3">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setSellShares(((userPosition.shares * pct) / 100).toFixed(4))}
                    className="flex-1 rounded-md bg-surface border border-border-subtle py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setSellShares(userPosition.shares.toFixed(4))}
                  className="flex-1 rounded-md bg-surface border border-border-subtle py-1.5 text-xs text-no hover:opacity-80 transition-colors"
                >
                  Max
                </button>
              </div>

              {/* Sell estimate */}
              {sellEstimate !== null && sellSharesNum > 0 && (
                <div className="mb-3 rounded-lg bg-background border border-border-subtle p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Est. return</span>
                    <span className="font-mono text-yes font-semibold">{formatCurrency(sellEstimate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Shares</span>
                    <span className="font-mono text-text-primary">{sellSharesNum.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-text-faint pt-1">Sells are always free</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── BUY mode ── */}
      {(tradeMode === "buy" || isCategorical) && (
        <>
          {/* Side toggle */}
          <div className="mb-5 flex gap-2">
            <button
              onClick={() => setSide("yes")}
              className={cn(
                "flex-1 py-3 rounded-lg font-semibold text-sm transition-all duration-150",
                side === "yes"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                  : "text-text-muted border border-transparent hover:text-text-primary hover:border-border-subtle"
              )}
            >
              Yes {Math.round(yesPrice * 100)}¢
            </button>
            <button
              onClick={() => setSide("no")}
              className={cn(
                "flex-1 py-3 rounded-lg font-semibold text-sm transition-all duration-150",
                side === "no"
                  ? "bg-red-500/15 text-red-400 border border-red-500/40"
                  : "text-text-muted border border-transparent hover:text-text-primary hover:border-border-subtle"
              )}
            >
              No {Math.round(noPrice * 100)}¢
            </button>
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs text-text-muted">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                $
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border-subtle bg-background py-2.5 pl-7 pr-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
              />
            </div>
            <div className="mt-2 flex gap-2">
              {[10, 25, 50, 100].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  className={cn(
                    "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all duration-150",
                    amount === String(preset)
                      ? "border-caldera/50 bg-caldera/10 text-caldera"
                      : "border-border-subtle bg-surface-2 text-text-muted hover:border-border-default hover:text-text-primary"
                  )}
                >
                  ${preset}
                </button>
              ))}
            </div>
            {(() => {
              const burnToken = getCategoryTokenDisplay(market.category, market.crypto_ticker, market.creator_slug);
              const burnSlug = getCategoryTokenSlug(market.category, market.crypto_ticker, market.creator_slug);
              return (
                <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-3 mt-2">
                  <div className="text-xs font-medium text-orange-400 mb-2">Fee Breakdown</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Caldera platform</span>
                      <span className="text-white">1%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">{burnToken} buy & burn</span>
                      <span className="text-orange-400">1% 🔥</span>
                    </div>
                  </div>
                  <a href={`/creators/${burnSlug}`}
                     className="mt-2 text-xs text-orange-400 hover:underline block">
                    View {burnToken} token →
                  </a>
                </div>
              );
            })()}
          </div>

          {/* Quote details */}
          {quote && (
            <div className="mb-4 space-y-2 rounded-lg bg-background p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Shares</span>
                <span className="font-mono text-text-primary">
                  {quote.sharesReceived.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Avg Price</span>
                <span className="font-mono text-text-primary">
                  {(quote.avgFillPrice * 100).toFixed(1)}¢
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Price Impact</span>
                <span
                  className={cn(
                    "font-mono",
                    quote.priceImpact > 5 ? "text-no" : "text-text-primary"
                  )}
                >
                  {formatPercentDecimal(quote.priceImpact / 100)}
                </span>
              </div>
              <div className="border-t border-border-subtle pt-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-muted">Platform fee</span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(quote.fees.platformFee)}
                  </span>
                </div>
                {quote.fees.creatorFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Creator fee</span>
                    <span className="font-mono text-text-primary">
                      {formatCurrency(quote.fees.creatorFee)}
                    </span>
                  </div>
                )}
                {quote.fees.coinHolderPoolFee > 0 && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-caldera">
                      Token holders
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-caldera/60" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-surface border-border-subtle text-text-primary">
                            <p className="text-xs">
                              Distributed to all token holders proportional to their holdings
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="font-mono text-caldera">
                      {formatCurrency(quote.fees.coinHolderPoolFee)}
                    </span>
                  </div>
                )}
                {quote.fees.marketCreatorFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Market creator fee</span>
                    <span className="font-mono text-text-primary">
                      {formatCurrency(quote.fees.marketCreatorFee)}
                    </span>
                  </div>
                )}
                <div className="border-t border-border-subtle/50 pt-1.5 flex justify-between font-medium">
                  <span className="text-text-muted">Total</span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(quote.fees.totalFee)}{" "}
                    <span className="text-text-muted font-normal">
                      ({((quote.fees.totalFee / amountNum) * 100).toFixed(1)}%)
                    </span>
                  </span>
                </div>
              </div>
              <div className="border-t border-border-subtle pt-2 space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-text-muted">Est. Payout if {side.toUpperCase()} wins</span>
                  <span className="font-mono text-yes">
                    {formatCurrency(quote.estimatedPayout)}
                  </span>
                </div>
                <p className="text-[10px] text-text-faint">Sells are always free</p>
              </div>
            </div>
          )}
        </>
      )}

      {tradeStatus && (
        <div className="mb-3 text-xs text-orange-400 text-center animate-pulse">
          {tradeStatus}
        </div>
      )}

      {tradeSuccess && (
        <div className={cn(
          "mb-3 rounded-lg border p-3 text-center",
          tradeSuccess.mode === "buy"
            ? "bg-emerald-500/15 border-emerald-500/30"
            : "bg-amber-500/10 border-amber-500/20"
        )}>
          <p className={cn("font-semibold text-sm", tradeSuccess.mode === "buy" ? "text-emerald-400" : "text-amber-400")}>
            {tradeSuccess.mode === "buy" ? "✓ Trade confirmed!" : "✓ Sold!"}
          </p>
          <p className={cn("text-xs mt-0.5", tradeSuccess.mode === "buy" ? "text-emerald-400/70" : "text-amber-400/70")}>
            {tradeSuccess.mode === "buy"
              ? `You bought ${tradeSuccess.shares.toFixed(2)} ${tradeSuccess.side.toUpperCase()} shares`
              : `You sold ${tradeSuccess.shares.toFixed(2)} ${tradeSuccess.side.toUpperCase()} shares`}
          </p>
        </div>
      )}
      {error && (
        <p className="mb-3 text-xs text-no">{error}</p>
      )}

      <Button
        onClick={handleTrade}
        disabled={
          market.status !== "open" ||
          (isConnected && tradeMode === "buy" && amountNum <= 0 && !isCategorical) ||
          (isConnected && tradeMode === "sell" && (sellSharesNum <= 0 || !userPosition)) ||
          isSubmitting
        }
        className={cn(
          "w-full py-3.5 rounded-xl font-bold text-base transition-all duration-150 active:scale-[0.99] shadow-lg",
          !isConnected || market.status !== "open"
            ? "bg-white text-black hover:bg-gray-100 shadow-none"
            : tradeMode === "sell"
            ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/25"
            : side === "yes"
            ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/25"
            : "bg-red-500 hover:bg-red-400 text-white shadow-red-500/25"
        )}
      >
        {isSubmitting
          ? (tradeStatus ?? "Confirming...")
          : market.status !== "open"
          ? "Market Closed"
          : !isConnected
          ? "Connect to Trade"
          : tradeMode === "sell"
          ? `Sell ${userPosition?.side?.toUpperCase() ?? ""} Shares`
          : isCategorical && selectedOutcome && side === "yes"
          ? `Buy YES — ${selectedOutcome.label}`
          : `Buy ${side.toUpperCase()}`}
      </Button>

      </>
      )}

    </div>
    </>
  );
}
