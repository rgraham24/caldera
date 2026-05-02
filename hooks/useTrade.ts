"use client";

import { useMemo } from "react";
import type { Market } from "@/types";
import { getTradeQuote, type TradeQuote } from "@/lib/trading/amm";
import {
  FEE_RATE_TOTAL,
  FEE_RATE_PLATFORM,
  FEE_RATE_CREATOR_AUTO_BUY,
} from "@/lib/fees/calculator";

export type DisplayFees = {
  grossAmount: number;
  total: number;
  platform: number;
  creatorAutoBuy: number;
  netAmount: number;
};

export function useTrade(
  market: Market,
  side: "yes" | "no",
  amount: number,
): { quote: TradeQuote | null; fees: DisplayFees | null } {
  return useMemo(() => {
    if (amount <= 0) return { quote: null, fees: null };

    try {
      const total = round8(amount * FEE_RATE_TOTAL);
      const platform = round8(amount * FEE_RATE_PLATFORM);
      const creatorAutoBuy = round8(amount * FEE_RATE_CREATOR_AUTO_BUY);
      const netAmount = round8(amount - total);

      const fees: DisplayFees = {
        grossAmount: amount,
        total,
        platform,
        creatorAutoBuy,
        netAmount,
      };

      const quote = getTradeQuote(
        { yesPool: market.yes_pool ?? 0, noPool: market.no_pool ?? 0 },
        side,
        netAmount
      );
      return { quote, fees };
    } catch {
      return { quote: null, fees: null };
    }
  }, [market, side, amount]);
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
