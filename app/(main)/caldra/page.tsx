"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/store";

type CaldraStats = {
  price: number;
  priceChange24h: number;
  holderCount: number;
  totalSupply: number;
  totalVolume: number;
  totalDistributed: number;
  reserve: number;
  foundingSpotsRemaining: number;
  yourHoldings: {
    balanceNanos: number;
    balanceUsd: number;
    totalInvested: number;
    totalEarned: number;
    isFoundingHolder: boolean;
  } | null;
};

export default function CaldraPage() {
  const [stats, setStats] = useState<CaldraStats | null>(null);
  const [amount, setAmount] = useState("");
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [sliderUsd, setSliderUsd] = useState(25);
  const { isAuthenticated } = useAppStore();

  useEffect(() => {
    fetch("/api/caldra/stats")
      .then((r) => r.json())
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, [success]);

  const price = stats?.price ?? 0.01;
  const amountNum = parseFloat(amount) || 0;
  const tokensEstimate = amountNum / price;

  const handleBuy = async () => {
    if (amountNum <= 0) return;
    setBuying(true);
    try {
      const res = await fetch("/api/caldra/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdAmount: amountNum }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setSuccess(
        `Purchased ${(data.tokensReceived / 1e9).toFixed(2)} CALDRA at ${formatCurrency(data.newPrice)}${data.isFoundingHolder ? " · 🏆 Founding Holder!" : ""}`
      );
      setAmount("");
    } catch {
      setSuccess(null);
    } finally {
      setBuying(false);
    }
  };

  // Calculator
  const calcTokens = sliderUsd / price;
  const calcPctSupply = stats?.totalSupply
    ? (calcTokens / ((stats.totalSupply / 1e9) + calcTokens)) * 100
    : 100;
  const weeklyVolume = 250000; // estimate
  const calcWeekly = weeklyVolume * 0.005 * (calcPctSupply / 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-caldera mb-1">🔥 Caldera Platform Token</p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary">
          $CALDRA
        </h1>
        <p className="mt-2 text-text-muted">
          The universal earnings token. Hold $CALDRA to earn from every prediction market on Caldera.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Price", value: formatCurrency(stats.price), tip: "Current price per CALDRA token. Rises as more people buy." },
            { label: "Holders", value: String(stats.holderCount), tip: "People currently holding CALDRA. All holders earn from every prediction on Caldera." },
            { label: "Volume", value: formatCurrency(stats.totalVolume), tip: "Total predictions made across all Caldera markets. More volume = more CALDRA earnings." },
            { label: "Distributed", value: formatCurrency(stats.totalDistributed), tip: "Total earnings paid out to CALDRA holders from prediction fees since launch." },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border-subtle/30 bg-surface p-3">
              <p className="text-[10px] uppercase tracking-widest text-text-muted">{s.label} <InfoTooltip text={s.tip} /></p>
              <p className="mt-1 font-mono text-lg font-bold text-text-primary">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Description */}
      <div className="mb-8 rounded-2xl border border-caldera/20 bg-caldera/5 p-5">
        <p className="text-sm text-text-muted leading-relaxed">
          Every trade on Caldera — Tiger Woods, LeBron James, the NBA Finals, creator predictions —
          pays <span className="text-caldera font-medium">0.5% to $CALDRA holders</span> automatically.
          The more Caldera grows, the more you earn. This is the only token that earns from everything.
        </p>
      </div>

      {/* Buy */}
      <div className="mb-8 trade-panel-glow rounded-2xl border border-cyan-500/20 bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Buy $CALDRA</h2>
        <div className="mb-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-border-subtle bg-background py-3 pl-7 pr-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-2">
            {[5, 10, 25, 50, 100].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                className="rounded-md bg-surface-2 px-3 py-1 text-xs text-text-muted hover:text-text-primary"
              >
                ${v}
              </button>
            ))}
          </div>
        </div>
        {amountNum > 0 && (
          <p className="mb-3 text-xs text-text-muted">
            ≈ {tokensEstimate.toFixed(2)} CALDRA at {formatCurrency(price)} each
          </p>
        )}
        {success && <p className="mb-3 text-xs text-yes">{success}</p>}
        <Button
          onClick={handleBuy}
          disabled={!isAuthenticated || amountNum <= 0 || buying}
          className="w-full bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {buying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {!isAuthenticated ? "Connect to buy" : buying ? "Processing..." : "Buy $CALDRA"}
        </Button>
      </div>

      {/* Your Holdings */}
      {stats?.yourHoldings && (
        <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            Your Holdings
            {stats.yourHoldings.isFoundingHolder && (
              <span className="ml-2 text-xs text-gold">🏆 Founding Holder</span>
            )}
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-muted">Balance</p>
              <p className="font-mono font-bold text-text-primary">
                {(stats.yourHoldings.balanceNanos / 1e9).toFixed(2)} CALDRA
              </p>
            </div>
            <div>
              <p className="text-text-muted">Value</p>
              <p className="font-mono font-bold text-text-primary">
                {formatCurrency(stats.yourHoldings.balanceUsd)}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Total Invested</p>
              <p className="font-mono text-text-primary">
                {formatCurrency(stats.yourHoldings.totalInvested)}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Total Earned</p>
              <p className="font-mono font-bold text-yes">
                {formatCurrency(stats.yourHoldings.totalEarned)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Calculator */}
      <div className="mb-8 rounded-2xl border border-caldera/20 bg-caldera/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          How much would I earn?
        </h2>
        <input
          type="range"
          min={1}
          max={500}
          value={sliderUsd}
          onChange={(e) => setSliderUsd(parseInt(e.target.value))}
          className="w-full accent-caldera"
        />
        <div className="mt-2 flex justify-between text-xs text-text-muted">
          <span>Invest {formatCurrency(sliderUsd)}</span>
          <span>{calcTokens.toFixed(2)} CALDRA</span>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Your % of supply</span>
            <span className="font-mono text-text-primary">{calcPctSupply.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Est. weekly earnings</span>
            <span className="font-mono font-bold text-caldera">~{formatCurrency(calcWeekly)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Annualized</span>
            <span className="font-mono text-yes">~{formatCurrency(calcWeekly * 52)}/yr</span>
          </div>
        </div>
      </div>

      {/* Founding Holders */}
      {stats && stats.foundingSpotsRemaining > 0 && (
        <div className="rounded-2xl border border-gold/20 bg-gold/5 p-5 text-center">
          <p className="text-sm font-semibold text-gold">🏆 Founding Holders</p>
          <p className="mt-1 text-xs text-text-muted">
            First 100 holders get the Founding Holder badge forever.
          </p>
          <p className="mt-2 font-mono text-lg font-bold text-gold">
            {stats.foundingSpotsRemaining} spots remaining
          </p>
        </div>
      )}
    </div>
  );
}
