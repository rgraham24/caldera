"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import type { Market } from "@/types";
import { MarketCard } from "@/components/markets/MarketCard";

type NewMarketsClientProps = {
  initialMarkets: Market[];
  pageSize: number;
};

export function NewMarketsClient({ initialMarkets, pageSize }: NewMarketsClientProps) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMarkets.length === pageSize);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/markets?sort=newest&status=open&limit=${pageSize}&offset=${markets.length}`
      );
      const json = await res.json();
      const next: Market[] = Array.isArray(json?.data) ? json.data : [];
      // Dedupe by id in case offset skews on a fresh insert between batches.
      const seen = new Set(markets.map((m) => m.id));
      const fresh = next.filter((m) => !seen.has(m.id));
      setMarkets((prev) => [...prev, ...fresh]);
      setHasMore(next.length === pageSize);
    } catch {
      // Silent — leaves existing list intact, button stays enabled for retry.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-orange-400" />
          <h1 className="text-2xl font-bold">New Markets</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The latest prediction markets just added to Caldera
        </p>
      </div>

      {markets.length === 0 ? (
        <p className="text-muted-foreground text-sm">No markets yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} showCreatedAgo />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
