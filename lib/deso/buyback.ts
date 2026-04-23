/**
 * lib/deso/buyback.ts
 *
 * Executes a DeSo creator-coin buyback on behalf of Caldera's platform
 * wallet, funded by the auto_buy_pool slice of a trade's fees.
 *
 * Called fire-and-forget from the trade route (app/api/trades/route.ts).
 * The fee_earnings row for the auto_buy_pool slice is passed in by id;
 * this module writes status='paid' + tx_hash on success, or
 * status='failed' + failed_reason on any gate failure.
 *
 * Never throws out — top-level try/catch catches unexpected errors and
 * still UPDATEs the ledger. If the UPDATE itself fails (DB down), the
 * row remains in 'pending' and a future reconciliation sweep can
 * detect + retry.
 *
 * Depends on:
 *   - lib/deso/rate        (fetchDesoUsdRate, usdToDesoNanos, DESO_API_BASE)
 *   - lib/deso/transaction (signAndSubmit)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchDesoUsdRate,
  usdToDesoNanos,
  DESO_API_BASE,
} from '@/lib/deso/rate';
import { signAndSubmit } from '@/lib/deso/transaction';

// ─── Types ─────────────────────────────────────────────────────────

export type BuybackParams = {
  desoPublicKey: string;
  amountUsd: number;
  feeEarningsRowId: string;
  platformPublicKey: string;
  platformSeed: string;
  supabase: SupabaseClient;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

// Minimum nanos DeSo will accept for a creator-coin buy.
// Well-known DeSo floor — buys below this get rejected with a confusing
// error so we check up front.
const DESO_BUY_FLOOR_NANOS = BigInt(1000);

// ─── Pure helpers ──────────────────────────────────────────────────

/**
 * Validate the caller-supplied buyback params. Pure function (no I/O).
 * Extracted so it can be unit-tested and so the main flow reads cleanly.
 */
export function validateBuybackInputs(params: BuybackParams): ValidationResult {
  const {
    desoPublicKey,
    amountUsd,
    feeEarningsRowId,
    platformPublicKey,
    platformSeed,
  } = params;

  if (!desoPublicKey || typeof desoPublicKey !== 'string') {
    return { ok: false, reason: 'invalid: desoPublicKey missing' };
  }
  if (!desoPublicKey.startsWith('BC1Y')) {
    return { ok: false, reason: 'invalid: desoPublicKey not a DeSo key' };
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { ok: false, reason: `invalid: amountUsd=${amountUsd}` };
  }
  if (!feeEarningsRowId || typeof feeEarningsRowId !== 'string') {
    return { ok: false, reason: 'invalid: feeEarningsRowId missing' };
  }
  if (!platformPublicKey || !platformPublicKey.startsWith('BC1Y')) {
    return { ok: false, reason: 'invalid: platformPublicKey missing/malformed' };
  }
  if (!platformSeed || typeof platformSeed !== 'string') {
    return { ok: false, reason: 'invalid: platformSeed missing' };
  }

  return { ok: true };
}

// ─── Internal helpers ──────────────────────────────────────────────

/**
 * Write a failure to the fee_earnings row. Never throws out; any DB
 * failure is logged but not propagated (this is already a failure path).
 */
async function markFailed(
  supabase: SupabaseClient,
  feeEarningsRowId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('fee_earnings')
    .update({ status: 'failed', failed_reason: reason })
    .eq('id', feeEarningsRowId);
  if (error) {
    console.error(
      `[buyback] CRITICAL: failed to mark row ${feeEarningsRowId} as failed:`,
      error.message
    );
  }
}

/**
 * Build a DeSo buy-creator-coin transaction hex via the DeSo API.
 * Returns { txHex } on success, { error } on any HTTP/parsing failure.
 */
async function buildBuybackTxHex(opts: {
  platformPublicKey: string;
  desoPublicKey: string;
  buyAmountNanos: bigint;
}): Promise<{ txHex: string } | { error: string }> {
  try {
    const response = await fetch(
      `${DESO_API_BASE}/api/v0/buy-or-sell-creator-coin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          UpdaterPublicKeyBase58Check: opts.platformPublicKey,
          CreatorPublicKeyBase58Check: opts.desoPublicKey,
          OperationType: 'buy',
          // DeSo expects DeSoToSellNanos as a number; our bigint fits
          // comfortably for all realistic amounts (< Number.MAX_SAFE_INTEGER).
          DeSoToSellNanos: Number(opts.buyAmountNanos),
          MinCreatorCoinExpectedNanos: 0,
          MinFeeRateNanosPerKB: 1000,
        }),
      }
    );

    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      return {
        error: `buy-or-sell HTTP ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = await response.json();
    const txHex = data?.TransactionHex;
    if (!txHex || typeof txHex !== 'string') {
      return {
        error: `buy-or-sell response missing TransactionHex: ${JSON.stringify(data).slice(0, 300)}`,
      };
    }

    return { txHex };
  } catch (err) {
    return {
      error: `buy-or-sell fetch threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Execute a creator-coin buyback against DeSo. Fire-and-forget contract:
 * never throws, always writes the outcome to the fee_earnings row.
 *
 * See the flow diagram in the project DECISIONS / 3d.2c notes for the
 * full decision tree. Every failure gate writes status='failed' with
 * a specific reason; success writes status='paid' with tx_hash.
 */
export async function executeTokenBuyback(params: BuybackParams): Promise<void> {
  const {
    desoPublicKey,
    amountUsd,
    feeEarningsRowId,
    platformPublicKey,
    platformSeed,
    supabase,
  } = params;

  try {
    // Gate 1: input validation
    const validation = validateBuybackInputs(params);
    if (!validation.ok) {
      console.error(
        `[buyback] input validation failed for row ${feeEarningsRowId}: ${validation.reason}`
      );
      await markFailed(supabase, feeEarningsRowId, validation.reason);
      return;
    }

    // Gate 2: DeSo USD rate
    const rate = await fetchDesoUsdRate();
    if (!rate) {
      await markFailed(supabase, feeEarningsRowId, 'deso rate fetch returned null');
      return;
    }

    // Gate 3: USD → nanos conversion
    const buyAmountNanos = usdToDesoNanos(amountUsd, rate);
    if (buyAmountNanos === null) {
      await markFailed(
        supabase,
        feeEarningsRowId,
        `usdToDesoNanos returned null (usd=${amountUsd}, rate=${rate})`
      );
      return;
    }
    if (buyAmountNanos <= DESO_BUY_FLOOR_NANOS) {
      await markFailed(
        supabase,
        feeEarningsRowId,
        `buy amount below DeSo floor: ${buyAmountNanos} nanos (usd=${amountUsd}, rate=${rate})`
      );
      return;
    }

    // Gate 4: build DeSo transaction hex
    const build = await buildBuybackTxHex({
      platformPublicKey,
      desoPublicKey,
      buyAmountNanos,
    });
    if ('error' in build) {
      await markFailed(supabase, feeEarningsRowId, build.error);
      return;
    }

    // Gate 5: sign + submit
    const result = await signAndSubmit(build.txHex, platformSeed);
    if (!result.success) {
      await markFailed(
        supabase,
        feeEarningsRowId,
        `${result.stage}: ${result.error}`
      );
      return;
    }

    // Success — write tx hash, status, paid_at
    const { error: updateErr } = await supabase
      .from('fee_earnings')
      .update({
        status: 'paid',
        tx_hash: result.txHashHex,
        paid_at: new Date().toISOString(),
      })
      .eq('id', feeEarningsRowId);

    if (updateErr) {
      console.error(
        `[buyback] CRITICAL: bought $${amountUsd} of ${desoPublicKey} ` +
        `(tx=${result.txHashHex}) but FAILED to mark fee_earnings row ` +
        `${feeEarningsRowId} as paid:`,
        updateErr.message
      );
      return;
    }

    console.log(
      `[buyback] ✅ bought $${amountUsd} of ${desoPublicKey} for row ` +
      `${feeEarningsRowId} — tx: ${result.txHashHex}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[buyback] unexpected error for row ${feeEarningsRowId}:`,
      msg,
      err instanceof Error ? err.stack : undefined
    );
    // Best-effort write-through; don't let this throw either.
    try {
      await markFailed(supabase, feeEarningsRowId, `unexpected: ${msg}`);
    } catch (innerErr) {
      console.error(
        `[buyback] double-failure — couldn't even mark row as failed:`,
        innerErr instanceof Error ? innerErr.message : String(innerErr)
      );
    }
  }
}
