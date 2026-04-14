"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

type HolderCalculatorProps = {
  symbol: string;
  coinPrice: number;
  totalCoinsInCirculation: number;
  weeklyVolume: number;
  marketCount?: number;
  creatorName?: string;
  creatorSlug?: string;
};

export function HolderCalculator({
  symbol,
  coinPrice,
  totalCoinsInCirculation,
  weeklyVolume,
  marketCount = 0,
  creatorName,
  creatorSlug,
}: HolderCalculatorProps) {
  const [coins, setCoins] = useState(1);

  const pctOfSupply = totalCoinsInCirculation > 0 ? (coins / totalCoinsInCirculation) * 100 : 0;
  const userSharePercent = pctOfSupply / 100;

  // Projection when no real volume yet
  const hasRealVolume = weeklyVolume > 0;
  const projectedWeeklyVolume = !hasRealVolume && marketCount > 0
    ? marketCount * 5000  // assume $5k per market per week as baseline
    : weeklyVolume;

  const projectedEarnings = projectedWeeklyVolume * 0.01 * userSharePercent;
  const isProjection = !hasRealVolume && marketCount > 0;

  const weeklyEarnings = weeklyVolume * 0.01 * userSharePercent;
  const annualEarnings = (isProjection ? projectedEarnings : weeklyEarnings) * 52;
  const costToBuy = coins * coinPrice;

  return (
    <div className="rounded-2xl border border-caldera/20 bg-caldera/5 p-5">
      {/* Why hold this token? explainer */}
      {creatorName && creatorSlug && (
        <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <p className="text-xs text-orange-300 font-medium mb-1">
            How the token burn works
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every time someone trades a prediction market about{" "}
            <span className="text-foreground font-medium">{creatorName}</span>,
            1% of the fee automatically buys back{" "}
            <span className="text-orange-400">${creatorSlug}</span> on-chain.
            The more markets trade, the more buybacks accumulate.
          </p>
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold text-text-primary">
        How much do I earn?
      </h3>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-text-muted">
          How many ${symbol} coins do you hold?
        </label>
        <input
          type="range"
          min={0.1}
          max={Math.max(totalCoinsInCirculation * 0.2, 10)}
          step={0.1}
          value={coins}
          onChange={(e) => setCoins(parseFloat(e.target.value))}
          className="w-full accent-caldera"
        />
        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span className="font-mono">{coins.toFixed(1)} coins</span>
          <span className="font-mono">Cost: {formatCurrency(costToBuy)}</span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-muted">Your % of supply</span>
          <span className="font-mono text-text-primary">{pctOfSupply.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">7-day volume</span>
          <span className="font-mono text-text-primary">{formatCurrency(weeklyVolume)}</span>
        </div>
        <div className="flex justify-between border-t border-caldera/10 pt-2 items-center">
          <span className="text-sm font-medium">
            {isProjection ? "Est. weekly earnings (projected)" : "Est. weekly earnings"}
          </span>
          <span className={`text-sm font-semibold font-mono ${isProjection ? "text-orange-400" : "text-green-400"}`}>
            {isProjection ? "~" : ""}{formatCurrency(isProjection ? projectedEarnings : weeklyEarnings)}
          </span>
        </div>
        {isProjection && (
          <p className="text-xs text-muted-foreground mt-1">
            Based on {marketCount} active market{marketCount !== 1 ? "s" : ""}.
            Updates with real trading volume.
          </p>
        )}
        {!isProjection && (
          <p className="text-[10px] text-text-faint font-mono">
            {formatCurrency(weeklyVolume)} × 1% × {pctOfSupply.toFixed(2)}% = {formatCurrency(weeklyEarnings)}/wk
          </p>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Annualized</span>
          <span className="font-mono text-yes">~{formatCurrency(annualEarnings)}/yr</span>
        </div>
      </div>

      {hasRealVolume && (
        <p className="mt-3 text-[10px] text-text-faint">
          If volume doubles → ~{formatCurrency(weeklyEarnings * 2)}/wk
        </p>
      )}
    </div>
  );
}
