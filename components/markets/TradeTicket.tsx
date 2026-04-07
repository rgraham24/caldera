"use client";

import { useState, useMemo } from "react";
import type { Market } from "@/types";
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
import { connectDeSoWallet } from "@/lib/deso/auth";

type TradeTicketProps = {
  market: Market;
  feeConfig: Record<string, string>;
  onTradeComplete?: () => void;
};

export function TradeTicket({
  market,
  feeConfig,
  onTradeComplete,
}: TradeTicketProps) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<{ shares: number; side: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isConnected } = useAppStore();

  const amountNum = parseFloat(amount) || 0;

  const quote = useMemo(() => {
    if (amountNum <= 0) return null;
    try {
      const feeType = getMarketFeeType(market);
      const fees = calculateFees(amountNum, feeType, feeConfig);
      const tradeQuote = getTradeQuote(
        { yesPool: market.yes_pool, noPool: market.no_pool },
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

    // First-time trader onboarding
    if (typeof window !== "undefined" && !localStorage.getItem("caldera_onboarded")) {
      setShowOnboarding(true);
      return;
    }

    if (!quote || amountNum <= 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          side,
          amount: amountNum,
          desoPublicKey: useAppStore.getState().desoPublicKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Trade failed");
      }

      const shares = data?.data?.quote?.sharesReceived ?? quote?.sharesReceived ?? 0;
      setTradeSuccess({ shares, side });
      setAmount("");
      onTradeComplete?.();
      setTimeout(() => setTradeSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="relative trade-panel-glow rounded-2xl border border-cyan-500/20 bg-surface p-5">
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
          Yes {Math.round(market.yes_price * 100)}¢
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
          No {Math.round(market.no_price * 100)}¢
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
        <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
          1% to Caldera · 1% buys the token · Free to sell
        </p>
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

      {tradeSuccess && (
        <div className="mb-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3 text-center">
          <p className="text-emerald-400 font-semibold text-sm">✓ Trade confirmed!</p>
          <p className="text-emerald-400/70 text-xs mt-0.5">
            You bought {tradeSuccess.shares.toFixed(2)} {tradeSuccess.side.toUpperCase()} shares
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
          ? "Confirming..."
          : market.status !== "open"
          ? "Market Closed"
          : !isConnected
          ? "Connect to Trade"
          : `Buy ${side.toUpperCase()}`}
      </Button>

      {/* First-time onboarding overlay */}
      {showOnboarding && (
        <div className="absolute inset-0 z-20 flex flex-col justify-center rounded-2xl bg-surface/95 p-6 backdrop-blur-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-caldera">How predictions work</p>
          <h3 className="mb-3 font-display text-xl font-bold text-text-primary">
            You&apos;re about to buy {side.toUpperCase()} on:
          </h3>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            &ldquo;{market.title}&rdquo;
          </p>
          <div className="mb-4 rounded-xl border border-border-subtle/30 bg-background p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Current odds</span>
              <span className={cn("font-mono font-bold", side === "yes" ? "text-yes" : "text-no")}>
                {side === "yes" ? Math.round(market.yes_price * 100) : Math.round(market.no_price * 100)}% likely
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Cost per share</span>
              <span className="font-mono text-text-primary">
                {side === "yes" ? Math.round(market.yes_price * 100) : Math.round(market.no_price * 100)}¢
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Payout per share if correct</span>
              <span className="font-mono text-yes font-bold">$1.00</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Value if wrong</span>
              <span className="font-mono text-no">$0.00</span>
            </div>
          </div>
          <p className="mb-6 text-xs text-text-faint">
            Never predict more than you can afford to lose.
          </p>
          <Button
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.setItem("caldera_onboarded", "true");
              }
              setShowOnboarding(false);
            }}
            className="w-full bg-caldera text-white hover:bg-caldera/90 font-semibold"
          >
            Got it, let me trade →
          </Button>
        </div>
      )}

    </div>
    </>
  );
}
