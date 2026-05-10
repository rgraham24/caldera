/**
 * Cumulative cash invested curve for /portfolio.
 *
 * V1 caveat: this is NOT mark-to-market. We don't have dense
 * market_price_history snapshots tied to trade times, so we plot the
 * honest, simpler thing — running net cash spent on prediction markets.
 * Each buy adds gross_amount; each sell subtracts. The shape mirrors
 * "how much skin does this user have in the game over time."
 *
 * Returns one point per trade timestamp (no daily downsampling — gives
 * a stepped curve that accurately reflects discrete trade events). The
 * caller renders with monotone interpolation so the steps look like a
 * smooth line.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EquityPoint = {
  date: string; // ISO timestamp
  value: number; // cumulative net cash invested in USD
};

export type EquityCurveResult = {
  points: EquityPoint[];
  tradeCount: number;
  currentInvested: number;
};

const DEFAULT_LOOKBACK_DAYS = 30;

export async function buildEquityCurve(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<EquityCurveResult> {
  const cutoffIso = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("trades")
    .select("created_at, action_type, gross_amount")
    .eq("user_id", userId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    return { points: [], tradeCount: 0, currentInvested: 0 };
  }

  const trades = rows as Array<{
    created_at: string;
    action_type: string | null;
    gross_amount: number | string | null;
  }>;

  // Walk trades chronologically, accumulate cash invested.
  // Buys add to "invested", sells subtract (cashing out).
  let running = 0;
  const points: EquityPoint[] = [];
  for (const t of trades) {
    const amt = Number(t.gross_amount ?? 0);
    if (!Number.isFinite(amt)) continue;
    const signed = t.action_type === "sell" ? -amt : amt;
    running += signed;
    points.push({ date: t.created_at, value: round2(running) });
  }

  return {
    points,
    tradeCount: trades.length,
    currentInvested: round2(running),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
