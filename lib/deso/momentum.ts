/**
 * Compares today's creator-coin price against an N-day-old snapshot.
 *
 * Returns null until daily snapshots have accumulated. The hero/coupled-card
 * UI hides the arrow + percentage when momentum is null — better than
 * showing 0% / "no change" which implies fresh data we don't have.
 *
 * Lookup strategy: pick the snapshot closest to (now - days) within a 36h
 * window. Falls back to 1d-old if no 7d snapshot exists. Falls back to null
 * if neither exists.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type Momentum = {
  changePercent: number | null;
  comparedTo: "baseline" | "1d" | "7d";
};

type SnapshotRow = {
  creator_slug: string;
  price: number | string;
  recorded_at: string;
};

/**
 * Single-creator momentum lookup. Round-trips the DB once.
 */
export async function getCreatorCoinMomentum(
  slug: string,
  days: number = 7
): Promise<Momentum> {
  const map = await getCreatorCoinMomentumBatch([slug], days);
  return map.get(slug) ?? { changePercent: null, comparedTo: "baseline" };
}

/**
 * Batched momentum lookup for the hero / any list of creators. One round-trip
 * regardless of input size.
 */
export async function getCreatorCoinMomentumBatch(
  slugs: string[],
  days: number = 7
): Promise<Map<string, Momentum>> {
  const out = new Map<string, Momentum>();
  if (!slugs.length) return out;

  const supabase = createServiceClient();

  // Pull all snapshots in the window for these slugs in a single query.
  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const earliest = new Date(Date.now() - cutoffMs - 36 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshots } = await (supabase as any)
    .from("creator_coin_price_snapshots")
    .select("creator_slug, price, recorded_at")
    .in("creator_slug", slugs)
    .gte("recorded_at", earliest)
    .order("recorded_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestRows } = await (supabase as any)
    .from("creators")
    .select("slug, creator_coin_price")
    .in("slug", slugs);

  const latestBySlug = new Map<string, number>();
  for (const r of (latestRows ?? []) as Array<{ slug: string; creator_coin_price: number | string | null }>) {
    if (r.creator_coin_price !== null && r.creator_coin_price !== undefined) {
      latestBySlug.set(r.slug, Number(r.creator_coin_price));
    }
  }

  const bySlug = new Map<string, SnapshotRow[]>();
  for (const row of (snapshots ?? []) as SnapshotRow[]) {
    if (!bySlug.has(row.creator_slug)) bySlug.set(row.creator_slug, []);
    bySlug.get(row.creator_slug)!.push(row);
  }

  for (const slug of slugs) {
    const current = latestBySlug.get(slug);
    if (!current || current <= 0) {
      out.set(slug, { changePercent: null, comparedTo: "baseline" });
      continue;
    }
    const rows = bySlug.get(slug) ?? [];
    const target7 = pickNearest(rows, days * 24 * 60 * 60 * 1000, 36 * 60 * 60 * 1000);
    if (target7 && Number(target7.price) > 0) {
      const old = Number(target7.price);
      out.set(slug, {
        changePercent: ((current - old) / old) * 100,
        comparedTo: "7d",
      });
      continue;
    }
    const target1 = pickNearest(rows, 24 * 60 * 60 * 1000, 6 * 60 * 60 * 1000);
    if (target1 && Number(target1.price) > 0) {
      const old = Number(target1.price);
      out.set(slug, {
        changePercent: ((current - old) / old) * 100,
        comparedTo: "1d",
      });
      continue;
    }
    out.set(slug, { changePercent: null, comparedTo: "baseline" });
  }

  return out;
}

/**
 * Pick the snapshot whose age is closest to `targetAgeMs`, within
 * ±toleranceMs of that age. Returns null if none in window.
 */
function pickNearest(
  rows: SnapshotRow[],
  targetAgeMs: number,
  toleranceMs: number
): SnapshotRow | null {
  const now = Date.now();
  let best: SnapshotRow | null = null;
  let bestDelta = Infinity;
  for (const r of rows) {
    const age = now - new Date(r.recorded_at).getTime();
    const delta = Math.abs(age - targetAgeMs);
    if (delta <= toleranceMs && delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best;
}
