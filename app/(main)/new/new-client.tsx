"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import type { Market } from "@/types";
import { getTokenSymbolDisplay } from "@/lib/utils/tokenSymbol";

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
            {markets.map((market) => {
              const ageMs = Date.now() - new Date(market.created_at ?? "").getTime();
              const hoursAgo = Math.floor(ageMs / 3_600_000);
              const timeLabel =
                hoursAgo < 1 ? "Just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;
              const yesPercent = Math.round((market.yes_price ?? 0.5) * 100);
              return (
                <Link
                  key={market.id}
                  href={`/markets/${market.id}`}
                  className="block p-4 rounded-xl border border-border bg-surface hover:border-orange-500/40 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                      {market.category}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeLabel}</span>
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
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${yesPercent}%` }}
                      />
                    </div>
                  </div>
                  {market.creator_slug && (
                    <div className="mt-2 text-xs text-orange-400">
                      {getTokenSymbolDisplay({ slug: market.creator_slug })}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Show More — only when we believe there's more to load. Disabled
              + label-shift while a fetch is in flight. */}
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
