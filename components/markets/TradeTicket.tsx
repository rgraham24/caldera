"use client";

import { useState, useMemo } from "react";
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
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<{ shares: number; side: string } | null>(null);
  const { isConnected, desoPublicKey } = useAppStore();

  const amountNum = parseFloat(amount) || 0;

  const quote = useMemo(() => {
    if (amountNum <= 0) return null;
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
  }, [amountNum, side, market, feeConfig]);

  const handleTrade = async () => {
    // Not connected — redirect to DeSo identity
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }

    if (!quote || amountNum <= 0) return;

    setIsSubmitting(true);
    setError(null);
    setTradeStatus(null);

    try {
      const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET;
      const currentDesoPublicKey = desoPublicKey ?? useAppStore.getState().desoPublicKey;

      let txnHash: string | undefined;

      // On-chain payment: send DESO to platform wallet before recording the trade
      if (platformWallet && currentDesoPublicKey) {
        // Get current DESO price for USD → nanos conversion
        const priceRes = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
        const priceData = await priceRes.json();
        const centsPerDeso = priceData.USDCentsPerDeSoExchangeRate ?? priceData.USDCentsPerDeSoCoin ?? 0;
        const desoUsdRate = centsPerDeso > 0 ? centsPerDeso / 100 : 0;

        if (desoUsdRate > 0) {
          const amountNanos = Math.floor((amountNum / desoUsdRate) * 1e9);

          setTradeStatus('Waiting for wallet approval...');
          const hash = await sendDesoPayment(
            currentDesoPublicKey,
            platformWallet,
            amountNanos
          );

          if (!hash) {
            throw new Error('Transaction cancelled or failed');
          }

          txnHash = hash;
          setTradeStatus('Recording trade...');
        }
      }

      // Record trade in Supabase (with or without on-chain hash)
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
      if (!res.ok) {
        throw new Error(data.error || "Trade failed");
      }

      const shares = data?.data?.quote?.sharesReceived ?? quote?.sharesReceived ?? 0;
      setTradeStatus(null);
      setTradeSuccess({ shares, side });
      setAmount("");
      onTradeComplete?.();
      setTimeout(() => setTradeSuccess(null), 4000);
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
    : market.no_price ?? 0;

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

      {tradeStatus && (
        <div className="mb-3 text-xs text-orange-400 text-center animate-pulse">
          {tradeStatus}
        </div>
      )}

      {tradeSuccess && (
        <div className="mb-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3 text-center">
          <p className="text-emerald-400 font-semibold text-sm">✓ Trade confirmed!</p>
          <p className="text-emerald-400/70 text-xs mt-0.5">
            You bought {tradeSuccess.shares.toFixed(2)} {tradeSuccess.side.toUpperCase()} shares
          </p>
          <p className="text-emerald-400/50 text-xs mt-0.5">
            Your position has been recorded on-chain
          </p>
        </div>
      )}
      {error && (
        <p className="mb-3 text-xs text-no">{error}</p>
      )}

      <Button
        onClick={handleTrade}
        disabled={(isConnected && (amountNum <= 0 || isSubmitting)) || market.status !== "open"}
        className={cn(
          "w-full py-3.5 rounded-xl font-bold text-base transition-all duration-150 active:scale-[0.99] shadow-lg",
          !isConnected || market.status !== "open"
            ? "bg-white text-black hover:bg-gray-100 shadow-none"
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
