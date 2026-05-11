import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/markets/sparkline
 *
 * Body: { marketIds: string[] }
 * Returns: { [marketId]: number[] }  — yes_price series, ~24 points
 *          per market, oldest → newest, over the last 7 days.
 *
 * The market_price_history table averages ~73 hourly snapshots per
 * open market over the last 7 days; we bucket those into ~24 even-
 * spaced time windows and take the mean yes_price per bucket so the
 * client always renders a stable ~24-point curve regardless of how
 * dense the underlying snapshots are.
 *
 * In-memory cache (60s) keyed by market_id keeps repeat page-loads
 * cheap without needing a separate edge cache layer.
 */

const BUCKET_COUNT = 24;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

type CacheEntry = { points: number[]; expires: number };
const cache = new Map<string, CacheEntry>();

export async function POST(req: NextRequest) {
  let body: { marketIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.marketIds)
    ? body.marketIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({});
  }

  const now = Date.now();
  const out: Record<string, number[]> = {};
  const missing: string[] = [];

  // Serve from cache where possible
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && hit.expires > now) {
      out[id] = hit.points;
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) {
    return NextResponse.json(out);
  }

  const supabase = createServiceClient();
  const cutoffIso = new Date(now - LOOKBACK_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("market_price_history")
    .select("market_id, yes_price, recorded_at")
    .in("market_id", missing)
    .gte("recorded_at", cutoffIso)
    .order("recorded_at", { ascending: true });

  if (error) {
    console.warn("[api/markets/sparkline] query failed:", error.message);
    // Don't fail the whole request; return what we had from cache
    return NextResponse.json(out);
  }

  // Group by market_id
  const byMarket = new Map<string, Array<{ t: number; y: number }>>();
  type Row = { market_id: string; yes_price: number | string | null; recorded_at: string };
  for (const r of (rows ?? []) as Row[]) {
    const y = Number(r.yes_price ?? 0);
    if (!Number.isFinite(y)) continue;
    const t = new Date(r.recorded_at).getTime();
    if (!byMarket.has(r.market_id)) byMarket.set(r.market_id, []);
    byMarket.get(r.market_id)!.push({ t, y });
  }

  const oldest = now - LOOKBACK_MS;
  const span = now - oldest;

  for (const id of missing) {
    const series = byMarket.get(id) ?? [];
    if (series.length < 2) {
      out[id] = [];
      cache.set(id, { points: [], expires: now + CACHE_TTL_MS });
      continue;
    }

    // Bucket into BUCKET_COUNT equal-time windows; take avg yes_price
    // per bucket. Empty buckets carry forward the previous value so
    // the line stays continuous.
    const buckets: number[] = [];
    let lastVal: number | null = null;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      const bStart = oldest + (span * i) / BUCKET_COUNT;
      const bEnd = oldest + (span * (i + 1)) / BUCKET_COUNT;
      const within = series.filter((p) => p.t >= bStart && p.t < bEnd);
      if (within.length > 0) {
        const avg = within.reduce((s, p) => s + p.y, 0) / within.length;
        buckets.push(avg);
        lastVal = avg;
      } else if (lastVal !== null) {
        buckets.push(lastVal);
      }
      // If lastVal is still null (no data yet in early buckets), skip
      // and let the curve start once we have a real datum.
    }

    out[id] = buckets;
    cache.set(id, { points: buckets, expires: now + CACHE_TTL_MS });
  }

  return NextResponse.json(out);
}
