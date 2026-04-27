/**
 * Shared resolve-market function. Wraps the atomic_resolve_market
 * RPC and returns a tagged Result. Used by all 4 resolve routes
 * (admin/resolve-market, markets/[id]/resolve, admin/auto-resolve,
 * cron/resolve-crypto-markets).
 *
 * The RPC writes markets UPDATE + positions UPDATE + position_payouts
 * INSERTs (winners only) + market_resolutions audit INSERT — all
 * atomic. Idempotent via WHERE status='open' on the markets UPDATE.
 *
 * P3-3 design doc: docs/P3-3-resolution-payout-design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolveOutcome = "yes" | "no" | "cancelled";

export interface ResolveMarketParams {
  marketId: string;
  outcome: ResolveOutcome;
  /** DeSo user UUID (NOT public key). NULL for cron-initiated resolves. */
  resolvedByUserId?: string | null;
  resolutionNote?: string | null;
  sourceUrl?: string | null;
}

export interface ResolveMarketSuccess {
  ok: true;
  positionsSettled: number;
  winnersCount: number;
  totalPayoutUsd: number;
}

export type ResolveMarketFailureReason =
  | "invalid-outcome"
  | "market-already-resolved-or-not-found"
  | "rpc-error";

export interface ResolveMarketFailure {
  ok: false;
  reason: ResolveMarketFailureReason;
  detail: string;
}

export type ResolveMarketResult = ResolveMarketSuccess | ResolveMarketFailure;

interface AtomicResolveMarketRpcReturn {
  positions_settled: number;
  winners_count: number;
  total_payout_usd: number | string;
}

/**
 * Atomically resolves a market via the atomic_resolve_market Postgres
 * RPC. Returns a tagged Result.
 *
 * Caller is responsible for auth/validation. This function is purely
 * a typed wrapper around the RPC.
 *
 * @example
 *   const result = await resolveMarket(supabase, {
 *     marketId: "abc-123",
 *     outcome: "yes",
 *     resolvedByUserId: adminUserId,
 *     resolutionNote: "ESPN_AUTO_RESOLVED",
 *   });
 *   if (!result.ok) {
 *     // Handle reason: 'invalid-outcome' | 'market-already-resolved-or-not-found' | 'rpc-error'
 *   }
 */
export async function resolveMarket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  params: ResolveMarketParams
): Promise<ResolveMarketResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcRes = (await (supabase as any).rpc("atomic_resolve_market", {
    p_market_id: params.marketId,
    p_outcome: params.outcome,
    p_resolved_by_user_id: params.resolvedByUserId ?? null,
    p_resolution_note: params.resolutionNote ?? null,
    p_source_url: params.sourceUrl ?? null,
  })) as {
    data: AtomicResolveMarketRpcReturn | null;
    error: { message: string; code?: string } | null;
  };

  if (rpcRes.error) {
    const msg = rpcRes.error.message ?? "";
    if (msg.startsWith("invalid-outcome:")) {
      return { ok: false, reason: "invalid-outcome", detail: msg };
    }
    if (msg.startsWith("market-already-resolved-or-not-found:")) {
      return {
        ok: false,
        reason: "market-already-resolved-or-not-found",
        detail: msg,
      };
    }
    return { ok: false, reason: "rpc-error", detail: msg };
  }

  const data = rpcRes.data;
  if (!data) {
    return {
      ok: false,
      reason: "rpc-error",
      detail: "RPC returned null data with no error",
    };
  }

  return {
    ok: true,
    positionsSettled: Number(data.positions_settled ?? 0),
    winnersCount: Number(data.winners_count ?? 0),
    totalPayoutUsd: Number(data.total_payout_usd ?? 0),
  };
}
