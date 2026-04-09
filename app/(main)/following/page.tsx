'use client';
import { useAppStore } from '@/store';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function FollowingPage() {
  const { isConnected, desoPublicKey } = useAppStore();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !desoPublicKey) { setLoading(false); return; }
    fetch(`/api/markets?sort=following&desoPublicKey=${desoPublicKey}&limit=50`)
      .then(r => r.json())
      .then(d => { setMarkets(d.data ?? []); setLoading(false); });
  }, [isConnected, desoPublicKey]);

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-3">Following</h1>
        <p className="text-muted-foreground mb-6">
          Connect your DeSo wallet to see markets about creators you follow
        </p>
        <button onClick={() => import('@/lib/deso/auth').then(m => m.connectDeSoWallet())}
          className="bg-white text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-100 transition-colors">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Following</h1>
        <p className="text-sm text-muted-foreground">
          Prediction markets about creators you follow on DeSo
        </p>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 rounded-xl bg-surface animate-pulse" />)}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-2">No markets yet for creators you follow.</p>
          <p className="text-sm text-muted-foreground">Follow more creators on DeSo to see their markets here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market: any) => {
            const yesPercent = Math.round((market.yes_price ?? 0.5) * 100);
            return (
              <Link key={market.id} href={`/markets/${market.id}`}
                className="block p-4 rounded-xl border border-border bg-surface hover:border-orange-500/40 transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                    {market.category}
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
                    <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${yesPercent}%` }} />
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
