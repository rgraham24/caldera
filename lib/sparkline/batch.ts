/**
 * Module-level batch fetcher for sparkline data.
 *
 * Multiple MarketCards on the same page all want sparkline data for
 * their own market. Instead of each issuing its own /api/markets/
 * sparkline POST, we coalesce all requests within a 50 ms window into
 * a single batched call. Results are cached for 60 s to absorb
 * follow-up renders (scroll, tab switch, re-render).
 *
 * Usage:
 *
 *   useEffect(() => {
 *     let cancelled = false;
 *     requestSparkline(market.id).then((points) => {
 *       if (!cancelled) setData(points);
 *     });
 *     return () => { cancelled = true; };
 *   }, [market.id]);
 */

const CACHE_TTL_MS = 60_000;
const FLUSH_DELAY_MS = 50;

type CacheEntry = { points: number[]; expires: number };

const cache = new Map<string, CacheEntry>();
const pendingIds = new Set<string>();
const inFlight = new Map<string, Promise<number[]>>();
let resolvers = new Map<string, Array<(v: number[]) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function requestSparkline(marketId: string): Promise<number[]> {
  const now = Date.now();
  const hit = cache.get(marketId);
  if (hit && hit.expires > now) {
    return Promise.resolve(hit.points);
  }

  // Already in flight from a recent batch — reuse that promise
  const existing = inFlight.get(marketId);
  if (existing) return existing;

  // Register interest in the next batch
  pendingIds.add(marketId);
  const promise = new Promise<number[]>((resolve) => {
    if (!resolvers.has(marketId)) resolvers.set(marketId, []);
    resolvers.get(marketId)!.push(resolve);
  });
  inFlight.set(marketId, promise);

  if (flushTimer === null) {
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }
  return promise;
}

async function flush() {
  flushTimer = null;
  const ids = Array.from(pendingIds);
  pendingIds.clear();
  const currentResolvers = resolvers;
  resolvers = new Map();
  if (ids.length === 0) return;

  let data: Record<string, number[]> = {};
  try {
    const res = await fetch("/api/markets/sparkline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketIds: ids }),
    });
    if (res.ok) {
      data = (await res.json()) as Record<string, number[]>;
    }
  } catch {
    // Network errors fall through with `data = {}` — every subscriber
    // gets [] and renders nothing rather than the call rejecting.
  }

  const expires = Date.now() + CACHE_TTL_MS;
  for (const id of ids) {
    const points = Array.isArray(data[id]) ? data[id] : [];
    cache.set(id, { points, expires });
    inFlight.delete(id);
    const subs = currentResolvers.get(id) ?? [];
    subs.forEach((resolve) => resolve(points));
  }
}
