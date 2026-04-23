/**
 * lib/fees/holderSnapshot.ts
 *
 * Per-holder snapshot of relevant-token holders at trade time, for the
 * 0.5% holder-rewards slice. Locked tokenomics 2026-04-21.
 *
 * Flow:
 *   1. trade route calls snapshotHolders() fire-and-forget
 *   2. fetchAllHolders() paginates DeSo GetHodlersForPublicKey
 *   3. computeHolderShares() splits amountUsd pro-rata across holders
 *   4. writeHolderRewards() bulk-inserts holder_rewards rows
 *
 * Dust handling: each holder's share is truncated at 8 decimals
 * (MVP — no remainder accounting).
 *
 * All errors inside snapshotHolders() are caught and logged; they do
 * NOT surface to the trade response (fire-and-forget).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RelevantToken } from './calculator';
import { fetchDesoUsdRate } from '@/lib/deso/rate';

// ─── Types ─────────────────────────────────────────────────────────

/** Shape of one holder entry as returned by DeSo GetHodlersForPublicKey */
export type DesoHolder = {
  HODLerPublicKeyBase58Check: string;
  BalanceNanos: number;
};

export type HolderShare = {
  holder_public_key: string;
  holder_balance: number;    // BalanceNanos from DeSo
  share_usd: number;          // this holder's pro-rata share
};

export type SnapshotInput = {
  trade_id: string;
  market_id: string;
  relevantToken: RelevantToken;
  totalAmountUsd: number;     // the v2Fees.holderRewards value
  desoUsdRate: number | null; // null if unknown — we still snapshot, just skip nanos
};

// ─── Pure math: pro-rata ───────────────────────────────────────────

/**
 * Given a list of holders and a total amount, compute each holder's
 * pro-rata share. Truncates to 8 decimals (numeric(20,8) DB precision).
 *
 * - Skips holders with BalanceNanos = 0.
 * - Skips holders whose rounded share is 0 (microcents — not worth a row).
 * - Returns empty array if total supply is 0.
 */
export function computeHolderShares(
  holders: DesoHolder[],
  totalAmountUsd: number
): HolderShare[] {
  const nonZero = holders.filter(h => h.BalanceNanos > 0);
  if (nonZero.length === 0) return [];

  const totalSupply = nonZero.reduce((acc, h) => acc + h.BalanceNanos, 0);
  if (totalSupply <= 0) return [];

  return nonZero
    .map(h => {
      const rawShare = (h.BalanceNanos / totalSupply) * totalAmountUsd;
      // Truncate (NOT round) to 8 decimals — pro-rata dust is lost, not inflated.
      const truncated = Math.floor(rawShare * 1e8) / 1e8;
      return {
        holder_public_key: h.HODLerPublicKeyBase58Check,
        holder_balance: h.BalanceNanos,
        share_usd: truncated,
      };
    })
    .filter(s => s.share_usd > 0);
}

// ─── DeSo API helpers ──────────────────────────────────────────────

const DESO_API_BASE = 'https://api.deso.org';
const MAX_HOLDER_COUNT = 50_000;

/**
 * Fetches all holders of a DeSo creator coin using FetchAll=true.
 *
 * Filters out the issuer's own holding (founder reward).
 * The issuer is identified by matching HODLerPublicKeyBase58Check
 * to the coin's own public key — this is the creator holding their
 * own supply, not an organic holder, and rewarding it would be
 * self-dealing (especially for platform-issued crypto coins and
 * category tokens).
 *
 * Returns empty array on API error — logs but doesn't throw. The
 * caller (snapshotHolders) is fire-and-forget and should gracefully
 * handle no holders.
 *
 * Sanity cap: if we get more than MAX_HOLDER_COUNT holders, log a
 * warning but still proceed. No DeSo coin is anywhere near this yet
 * but guards against future runaway.
 */
export async function fetchAllHolders(
  desoPublicKey: string
): Promise<DesoHolder[]> {
  try {
    const response = await fetch(
      `${DESO_API_BASE}/api/v0/get-hodlers-for-public-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PublicKeyBase58Check: desoPublicKey,
          LastPublicKeyBase58Check: '',
          FetchAll: true,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `[fetchAllHolders] DeSo API returned ${response.status} for ${desoPublicKey}`
      );
      return [];
    }

    const json = await response.json();
    const rawHolders: Array<DesoHolder & { CreatorPublicKeyBase58Check?: string }> =
      json.Hodlers || [];

    if (rawHolders.length > MAX_HOLDER_COUNT) {
      console.warn(
        `[fetchAllHolders] ${desoPublicKey} has ${rawHolders.length} holders ` +
        `(cap ${MAX_HOLDER_COUNT}) — snapshot may be slow.`
      );
    }

    // Filter: exclude the issuer's self-holding (founder reward).
    // The issuer is identified by HODLerPublicKeyBase58Check === desoPublicKey
    // (the creator coin's own public key). DeSo also returns CreatorPublicKeyBase58Check
    // per entry; we cross-check when available.
    const filtered = rawHolders.filter(h => {
      // Primary: self-holding by public key equality
      if (h.HODLerPublicKeyBase58Check === desoPublicKey) return false;
      // Defensive: if CreatorPublicKeyBase58Check is present and matches the
      // holder, also filter. (DeSo uses this to mark the creator's own row.)
      if (
        h.CreatorPublicKeyBase58Check &&
        h.CreatorPublicKeyBase58Check === h.HODLerPublicKeyBase58Check
      ) {
        return false;
      }
      return true;
    });

    // Map to our clean DesoHolder shape (drop any extra fields).
    return filtered.map(h => ({
      HODLerPublicKeyBase58Check: h.HODLerPublicKeyBase58Check,
      BalanceNanos: h.BalanceNanos,
    }));
  } catch (err) {
    console.error(
      `[fetchAllHolders] fetch failed for ${desoPublicKey}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Takes a snapshot of all holders of relevantToken at trade time and
 * writes one holder_rewards row per holder with their pro-rata share.
 *
 * CALLED FIRE-AND-FORGET from app/api/trades/route.ts. The trade has
 * already completed by the time this runs. Errors are logged but never
 * thrown — a failed snapshot does not undo the trade.
 *
 * Flow:
 *   1. Fetch DeSo USD rate once (used for all rows in this snapshot)
 *   2. fetchAllHolders (already filters out issuer)
 *   3. computeHolderShares (pro-rata math; already truncates dust)
 *   4. Bulk insert all rows in a single Supabase call
 *
 * If DeSo rate fetch fails, we still write the rows with NULL rate fields.
 * amount_usd is the authoritative value; amount_deso_nanos and
 * deso_usd_rate_at_accrual are denormalized for historical accounting.
 *
 * Idempotency: holder_rewards has a unique index on
 * (trade_id, holder_deso_public_key) WHERE trade_id IS NOT NULL.
 * If this function runs twice for the same trade (retry, cold-start),
 * the second insert fails loudly instead of double-crediting.
 */
export async function snapshotHolders(
  input: SnapshotInput,
  supabase: SupabaseClient
): Promise<void> {
  const { trade_id, market_id, relevantToken, totalAmountUsd } = input;

  try {
    if (!relevantToken.deso_public_key) {
      console.warn(
        `[snapshotHolders] skipped — relevantToken has no deso_public_key ` +
        `(slug=${relevantToken.slug}, trade=${trade_id})`
      );
      return;
    }

    // Rate first — one call, used for every row in this snapshot.
    // If it fails, we still proceed and write NULL rate fields.
    const desoUsdRate = await fetchDesoUsdRate();
    if (!desoUsdRate) {
      console.warn(
        `[snapshotHolders] DeSo rate fetch failed — writing rows with ` +
        `NULL amount_deso_nanos and deso_usd_rate_at_accrual ` +
        `(trade=${trade_id})`
      );
    }

    const holders = await fetchAllHolders(relevantToken.deso_public_key);
    if (holders.length === 0) {
      console.warn(
        `[snapshotHolders] 0 holders for ${relevantToken.slug} ` +
        `(trade=${trade_id}, amount=$${totalAmountUsd}) — ` +
        `slice dropped per 2026-04-21 no-holders policy.`
      );
      return;
    }

    const shares = computeHolderShares(holders, totalAmountUsd);
    if (shares.length === 0) {
      console.warn(
        `[snapshotHolders] 0 non-zero shares after compute for ` +
        `${relevantToken.slug} (trade=${trade_id}, holders=${holders.length}, ` +
        `amount=$${totalAmountUsd}) — likely dust-only result.`
      );
      return;
    }

    // Total supply among qualifying holders (for ledger traceability).
    const totalSupply = holders
      .filter(h => h.BalanceNanos > 0)
      .reduce((acc, h) => acc + h.BalanceNanos, 0);

    // Build rows. Include DeSo-denominated fields when rate is available.
    const rows = shares.map(s => ({
      holder_deso_public_key: s.holder_public_key,
      token_slug: relevantToken.slug,
      token_type: relevantToken.type,
      amount_usd: s.share_usd,
      amount_deso_nanos: desoUsdRate
        ? Math.floor((s.share_usd / desoUsdRate) * 1e9)
        : null,
      deso_usd_rate_at_accrual: desoUsdRate,
      trade_id,
      market_id,
      holder_coins_at_accrual: s.holder_balance,
      total_coins_at_accrual: totalSupply,
      status: 'pending',
    }));

    const { error } = await supabase.from('holder_rewards').insert(rows);

    if (error) {
      // Unique-violation error (23505 in Postgres) on our partial index
      // means this snapshot already ran for this trade. Log as WARN not
      // ERROR — it's expected deduplication, not a bug.
      if (error.code === '23505') {
        console.warn(
          `[snapshotHolders] duplicate snapshot for trade ${trade_id} ` +
          `(${relevantToken.slug}) — unique constraint prevented ` +
          `double-credit; no action needed.`
        );
      } else {
        console.error(
          `[snapshotHolders] bulk insert failed for ${relevantToken.slug} ` +
          `(trade=${trade_id}, rows=${rows.length}):`,
          error.message,
          error.details
        );
      }
      return;
    }

    console.log(
      `[snapshotHolders] wrote ${rows.length} rows for trade ${trade_id} ` +
      `(${relevantToken.slug} $${totalAmountUsd} @ deso_rate=$${desoUsdRate ?? 'NULL'})`
    );
  } catch (err) {
    console.error(
      `[snapshotHolders] unexpected error for trade ${trade_id}:`,
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : undefined
    );
  }
}
