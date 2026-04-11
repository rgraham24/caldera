'use client';

import { useAppStore } from '@/store';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MarketCard } from '@/components/markets/MarketCard';
import type { Market } from '@/types';

export default function FollowingPage() {
  const { isConnected, desoPublicKey } = useAppStore();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!isConnected || !desoPublicKey) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setIsFallback(false);

      try {
        // 1. Get the list of DeSo public keys this user follows
        const followRes = await fetch(`/api/following?publicKey=${encodeURIComponent(desoPublicKey)}`);
        const { followedKeys = [] } = await followRes.json() as { followedKeys: string[] };

        if (followedKeys.length > 0) {
          // 2. Look up creators in our DB whose deso_public_key is in the followed list
          const supabase = createClient();
          const { data: creators } = await supabase
            .from('creators')
            .select('id')
            .in('deso_public_key', followedKeys);

          const creatorIds = (creators ?? []).map((c) => c.id);

          if (creatorIds.length > 0) {
            // 3. Fetch open markets for those creators
            const { data: creatorMarkets } = await supabase
              .from('markets')
              .select('*')
              .in('creator_id', creatorIds)
              .eq('status', 'open')
              .order('trending_score', { ascending: false })
              .limit(50);

            if (creatorMarkets && creatorMarkets.length > 0) {
              setMarkets(creatorMarkets as Market[]);
              setLoading(false);
              return;
            }
          }
        }

        // 4. Fall back to trending markets
        setIsFallback(true);
        const supabase = createClient();
        const { data: trending } = await supabase
          .from('markets')
          .select('*')
          .eq('status', 'open')
          .order('trending_score', { ascending: false })
          .limit(24);
        setMarkets((trending ?? []) as Market[]);
      } catch {
        setMarkets([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isConnected, desoPublicKey]);

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-3">Following</h1>
        <p className="text-sm text-text-muted mb-6">
          Connect your DeSo wallet to see markets about creators you follow
        </p>
        <button
          onClick={() => import('@/lib/deso/auth').then((m) => m.connectDeSoWallet())}
          className="bg-white text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Following</h1>
        <p className="text-sm text-text-muted">
          {isFallback
            ? "No markets yet about people you follow — here's what's trending"
            : 'Prediction markets about creators you follow on DeSo'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-muted mb-2">No markets yet about people you follow.</p>
          <p className="text-sm text-text-muted">Follow more creators on DeSo to see their markets here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
