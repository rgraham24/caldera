/**
 * On-visit price refresh helper for hero/coupled-card surfaces.
 *
 * Takes a list of creator slugs, fetches fresh DeSo profile data per-creator
 * (with hard 1500ms timeouts and parallel allSettled), writes USD prices +
 * holder counts back to the creators table, and returns a Map keyed by slug.
 *
 * If DeSo is down or slow, falls back to whatever's already in the DB so the
 * hero still renders. Never throws; the hero must always paint.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getDesoPrice } from "@/lib/deso/api";

const DESO_API = "https://api.deso.org/api/v0";
const DEFAULT_TIMEOUT_MS = 1500;
const FALLBACK_DESO_USD = Number(process.env.DESO_USD_RATE ?? "4.63");

export type CreatorPriceResult = {
  price: number;
  holders: number;
  updated_at: string;
};

type CreatorRow = {
  slug: string;
  deso_username: string | null;
  deso_public_key: string | null;
  creator_coin_price: number | string | null;
  creator_coin_holders: number | null;
  coin_data_updated_at: string | null;
};

interface DeSoProfileResponse {
  Profile?: {
    CoinPriceDeSoNanos?: number;
    CoinEntry?: { NumberOfHolders?: number };
  };
}

/**
 * Fetch fresh prices for the given slugs. Empty input returns empty Map
 * without touching the network or DB.
 */
export async function refreshCreatorCoinPrices(
  slugs: string[]
): Promise<Map<string, CreatorPriceResult>> {
  const out = new Map<string, CreatorPriceResult>();
  if (!slugs.length) return out;

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: lookupErr } = await (supabase as any)
    .from("creators")
    .select(
      "slug, deso_username, deso_public_key, creator_coin_price, creator_coin_holders, coin_data_updated_at"
    )
    .in("slug", slugs);

  if (lookupErr || !rows?.length) {
    return out;
  }

  // Seed the map with whatever's in DB so callers always get something back
  // for slugs that exist, even if DeSo is unreachable.
  for (const r of rows as CreatorRow[]) {
    out.set(r.slug, {
      price: r.creator_coin_price !== null ? Number(r.creator_coin_price) : 0,
      holders: r.creator_coin_holders ?? 0,
      updated_at: r.coin_data_updated_at ?? new Date(0).toISOString(),
    });
  }

  // DeSo→USD rate: prefer live (300s server-cached) value; fall back to env if
  // the rate endpoint itself fails. Never let a failed rate kill the refresh.
  let desoUsd = FALLBACK_DESO_USD;
  try {
    desoUsd = await getDesoPrice();
  } catch (err) {
    console.warn(
      "[refresh-creator-prices] getDesoPrice failed, using fallback rate",
      FALLBACK_DESO_USD,
      err
    );
  }

  const now = new Date().toISOString();
  const updatesToWrite: Array<{
    slug: string;
    creator_coin_price: number;
    creator_coin_holders: number;
    coin_data_updated_at: string;
  }> = [];

  // Fire per-creator profile lookups in parallel. Promise.allSettled so one
  // slow/failed creator can't tank the whole batch.
  const lookups = (rows as CreatorRow[])
    .filter((r) => Boolean(r.deso_username))
    .map(async (r) => {
      const username = r.deso_username!;
      const t0 = Date.now();
      try {
        const profile = await fetchProfileWithTimeout(username, DEFAULT_TIMEOUT_MS);
        const took = Date.now() - t0;
        if (!profile) {
          console.log(
            `[refresh-creator-prices] ${username} no-profile in ${took}ms (DB fallback retained)`
          );
          return null;
        }
        const priceNanos = profile.CoinPriceDeSoNanos ?? 0;
        const priceDeso = priceNanos / 1e9;
        const priceUsd = priceDeso * desoUsd;
        const holders = profile.CoinEntry?.NumberOfHolders ?? 0;
        console.log(
          `[refresh-creator-prices] ${username} ok in ${took}ms price=$${priceUsd.toFixed(4)} holders=${holders}`
        );
        out.set(r.slug, { price: priceUsd, holders, updated_at: now });
        updatesToWrite.push({
          slug: r.slug,
          creator_coin_price: priceUsd,
          creator_coin_holders: holders,
          coin_data_updated_at: now,
        });
        return null;
      } catch (err) {
        const took = Date.now() - t0;
        console.warn(
          `[refresh-creator-prices] ${username} failed in ${took}ms — DB fallback retained:`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    });

  await Promise.allSettled(lookups);

  // Write fresh values back. Fire-and-forget per row so an UPDATE error on
  // one creator can't block the others. Logged but not thrown.
  await Promise.allSettled(
    updatesToWrite.map(async (u) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("creators")
        .update({
          creator_coin_price: u.creator_coin_price,
          creator_coin_holders: u.creator_coin_holders,
          coin_data_updated_at: u.coin_data_updated_at,
        })
        .eq("slug", u.slug);
      if (error) {
        console.warn(
          `[refresh-creator-prices] DB writeback failed for ${u.slug}:`,
          error.message
        );
      }
    })
  );

  return out;
}

/**
 * Per-creator DeSo profile fetch with hard timeout. Resolves to null on
 * timeout, network error, or non-2xx response. Never throws.
 */
async function fetchProfileWithTimeout(
  username: string,
  timeoutMs: number
): Promise<DeSoProfileResponse["Profile"] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DESO_API}/get-single-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: DeSoProfileResponse = await res.json();
    return data.Profile ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
