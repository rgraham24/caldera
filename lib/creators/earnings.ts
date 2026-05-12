/**
 * Source of truth for "real $X earned" on a creator's markets.
 *
 * Reads buyback_events (per-trade analytics, written by /api/trades
 * on every successful trade) to sum the personal-buyback slice that
 * accrues to this creator. Also reads the unclaimed_earnings_escrow
 * snapshot from creators — that column is only mutated by the claim
 * flow, so it lags real activity. Both numbers are surfaced so the
 * dashboard can distinguish lifetime accrual from "what's waiting
 * in the escrow right now."
 *
 * Server-side only. Use createServiceClient() to bypass RLS — these
 * tables are public-readable for the dashboard.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatorEarnings = {
  accruedUsd: number;
  accruedTradeCount: number;
  escrowUsd: number;
  isPreLaunch: boolean;
  lastEventAt: string | null;
};

export async function getCreatorEarnings(
  // The generated Database types don't cover buyback_events yet, so
  // accept a loose client here rather than fighting the type system.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  creatorSlug: string
): Promise<CreatorEarnings> {
  const [eventsRes, creatorRes] = await Promise.all([
    supabase
      .from("buyback_events")
      .select("personal_buyback_usd, created_at")
      .eq("creator_slug", creatorSlug)
      .order("created_at", { ascending: false }),
    supabase
      .from("creators")
      .select("unclaimed_earnings_escrow")
      .eq("slug", creatorSlug)
      .single(),
  ]);

  const events = (eventsRes.data ?? []) as Array<{
    personal_buyback_usd: number | string | null;
    created_at: string;
  }>;

  const accruedUsd = events.reduce(
    (sum, e) => sum + (Number(e.personal_buyback_usd) || 0),
    0
  );

  const escrowUsd = Number(
    (creatorRes.data as { unclaimed_earnings_escrow: number | string | null } | null)
      ?.unclaimed_earnings_escrow ?? 0
  );

  return {
    accruedUsd,
    accruedTradeCount: events.length,
    escrowUsd,
    isPreLaunch: accruedUsd < 1,
    lastEventAt: events[0]?.created_at ?? null,
  };
}
