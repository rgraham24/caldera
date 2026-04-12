'use client';
import { useEffect, useState } from 'react';

type Props = {
  ticker: string; // 'BTC', 'ETH', 'SOL', 'LINK', 'MATIC'
  targetPrice: number;
  resolvesAt: string;
};

const SUPPORTED_TICKERS = new Set(['BTC', 'ETH', 'SOL', 'LINK', 'DOGE']);

export function CryptoLivePriceBar({ ticker, targetPrice, resolvesAt }: Props) {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!SUPPORTED_TICKERS.has(ticker)) return;

    let prevPrice: number | null = null;
    const es = new EventSource(`/api/crypto/stream?ticker=${ticker}`);

    es.onmessage = (e) => {
      try {
        const { price } = JSON.parse(e.data) as { price: number };
        if (!price) return;
        setPriceChange(prevPrice !== null ? (price > prevPrice ? 'up' : price < prevPrice ? 'down' : null) : null);
        prevPrice = price;
        setCurrentPrice(price);
        setLastUpdated(new Date());
      } catch {}
    };

    es.onerror = () => { /* auto-reconnects */ };

    return () => es.close();
  }, [ticker]);

  useEffect(() => {
    function updateCountdown() {
      const now = new Date();
      const end = new Date(resolvesAt);
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) { setTimeLeft('Resolving...'); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2,'0')}`);
    }
    updateCountdown();
    const t = setInterval(updateCountdown, 1000);
    return () => clearInterval(t);
  }, [resolvesAt]);

  if (!currentPrice) return null;

  const isAboveTarget = currentPrice > targetPrice;
  const diffPct = ((currentPrice - targetPrice) / targetPrice * 100);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{ticker} Live Price</span>
          <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
        </div>
        {timeLeft && (
          <span className="text-xs font-mono text-text-muted">Resolves in {timeLeft}</span>
        )}
      </div>
      <div className="flex items-end gap-3">
        <span className={`text-3xl font-bold font-mono transition-colors duration-300 ${
          priceChange === 'up' ? 'text-yes' : priceChange === 'down' ? 'text-no' : 'text-text-primary'
        }`}>
          ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`text-sm font-semibold mb-1 ${isAboveTarget ? 'text-yes' : 'text-no'}`}>
          {isAboveTarget ? '▲' : '▼'} {Math.abs(diffPct).toFixed(2)}% vs target
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          Target: ${targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className={`text-xs font-semibold ${isAboveTarget ? 'text-yes' : 'text-no'}`}>
          Currently {isAboveTarget ? 'ABOVE' : 'BELOW'} target
        </span>
      </div>
      {lastUpdated && (
        <p className="text-[10px] text-text-faint mt-1">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
