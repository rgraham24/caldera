'use client';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import Link from 'next/link';

export default function BreakingPage() {
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/markets?sort=breaking&limit=50')
      .then(r => r.json())
      .then(d => { setMarkets(d.data ?? []); setLoading(false); });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-orange-400" />
          <h1 className="text-2xl font-bold">Breaking</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Markets resolving in the next 7 days — bet before they close
        </p>
      </div>

      {/* Markets grid — Polymarket style 3 col */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <p className="text-muted-foreground text-sm">No breaking markets right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market: any) => {
            const daysLeft = Math.ceil(
              (new Date(market.resolve_at).getTime() - Date.now()) / 86400000
            );
            const yesPercent = Math.round((market.yes_price ?? 0.5) * 100);
            return (
              <Link key={market.id} href={`/markets/${market.id}`}
                className="block p-4 rounded-xl border border-border bg-surface hover:border-orange-500/40 transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                    {market.category}
                  </span>
                  <span className={`text-xs font-medium ${daysLeft <= 1 ? 'text-red-400' : daysLeft <= 3 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                    {daysLeft <= 0 ? 'Ending today' : `${daysLeft}d left`}
                  </span>
                </div>
                <h3 className="font-semibold text-sm leading-tight line-clamp-2 mb-3 group-hover:text-orange-400 transition-colors">
                  {market.title}
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Chance</span>
                    <span className="font-bold text-green-400">{yesPercent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border">
                    <div className="h-1.5 rounded-full bg-green-500 transition-all"
                         style={{ width: `${yesPercent}%` }} />
                  </div>
                </div>
                {market.creator_slug && (
                  <div className="mt-2 text-xs text-orange-400">${market.creator_slug}</div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
