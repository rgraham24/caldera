"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

type HolderCalculatorProps = {
  symbol: string;
  coinPrice: number;
  totalCoinsInCirculation: number;
  weeklyVolume: number;
};

export function HolderCalculator({
  symbol,
  coinPrice,
  totalCoinsInCirculation,
  weeklyVolume,
}: HolderCalculatorProps) {
  const [coins, setCoins] = useState(1);

  const pctOfSupply = totalCoinsInCirculation > 0 ? (coins / totalCoinsInCirculation) * 100 : 0;
  const weeklyEarnings = weeklyVolume * 0.01 * (pctOfSupply / 100);
  const annualEarnings = weeklyEarnings * 52;
  const costToBuy = coins * coinPrice;

  return (
    <div className="rounded-2xl border border-caldera/20 bg-caldera/5 p-5">
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
        <div className="flex justify-between border-t border-caldera/10 pt-2">
          <span className="text-text-primary font-medium">Est. weekly earnings</span>
          <span className="font-mono font-bold text-caldera">{formatCurrency(weeklyEarnings)}</span>
        </div>
        <p className="text-[10px] text-text-faint font-mono">
          {formatCurrency(weeklyVolume)} × 1% × {pctOfSupply.toFixed(2)}% = {formatCurrency(weeklyEarnings)}/wk
        </p>
        <div className="flex justify-between">
          <span className="text-text-muted">Annualized</span>
          <span className="font-mono text-yes">~{formatCurrency(annualEarnings)}/yr</span>
        </div>
      </div>

      {weeklyVolume > 0 && (
        <p className="mt-3 text-[10px] text-text-faint">
          If volume doubles → ~{formatCurrency(weeklyEarnings * 2)}/wk
        </p>
      )}
    </div>
  );
}
