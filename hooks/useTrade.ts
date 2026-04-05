"use client";

import { useMemo } from "react";
import type { Market } from "@/types";
import { getTradeQuote, type TradeQuote } from "@/lib/trading/amm";
import {
  calculateFees,
  getMarketFeeType,
  type FeeBreakdown,
} from "@/lib/fees/calculator";

export function useTrade(
  market: Market,
  side: "yes" | "no",
  amount: number,
  feeConfig: Record<string, string>
): { quote: TradeQuote | null; fees: FeeBreakdown | null } {
  return useMemo(() => {
    if (amount <= 0) return { quote: null, fees: null };

    try {
      const feeType = getMarketFeeType(market);
      const fees = calculateFees(amount, feeType, feeConfig);
      const quote = getTradeQuote(
        { yesPool: market.yes_pool, noPool: market.no_pool },
        side,
        fees.netAmount
      );
      return { quote, fees };
    } catch {
      return { quote: null, fees: null };
    }
  }, [market, side, amount, feeConfig]);
}
