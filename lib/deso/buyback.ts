/**
 * lib/deso/buyback.ts
 *
 * Executes a DeSo creator-coin buyback on behalf of Caldera's platform
 * wallet, funded by the creator_auto_buy slice of a trade's fees.
 *
 * Called fire-and-forget from the trade route (app/api/trades/route.ts).
 * The fee_earnings row for the auto-buy slice is passed in by id;
 * this module writes status='paid' + tx_hash on success, or
 * status='failed' + failed_reason on any gate failure.
 *
 * Never throws out — top-level try/catch catches unexpected errors and
 * still UPDATEs the ledger. If the UPDATE itself fails (DB down), the
 * row remains in 'pending' and a future reconciliation sweep can
 * detect + retry.
 *
 * Returns a discriminated union (PB-2.5) so the caller can chain a
 * follow-up coin transfer to the creator on success.
 *
 * Depends on:
 *   - lib/deso/rate        (fetchDesoUsdRate, usdToDesoNanos, DESO_API_BASE)
 *   - lib/deso/transaction (signAndSubmit)
 *   - lib/deso/transfer    (transferCreatorCoin — for the post-buyback chain)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchDesoUsdRate,
  usdToDesoNanos,
  DESO_API_BASE,
} from '@/lib/deso/rate';
import { signAndSubmit } from '@/lib/deso/transaction';
import { transferCreatorCoin } from '@/lib/deso/transfer';

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

export type BuybackResult =
  | { ok: true; ccNanosReceived: bigint; txHashHex: string }
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
 * Returns the constructed tx hex AND the expected creator-coin nanos
 * the platform will receive (used for the follow-up transfer to the
 * creator's wallet under v2 tokenomics).
 */
async function buildBuybackTxHex(opts: {
  platformPublicKey: string;
  desoPublicKey: string;
  buyAmountNanos: bigint;
}): Promise<
  | { txHex: string; ccNanosExpected: bigint }
  | { error: string }
> {
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

    // ExpectedCreatorCoinReturnedNanos may legitimately be 0 (malformed
    // coin / frozen profile / DeSo-side oddity). Defer the zero-check to
    // the caller so the buyback itself still completes — the post-buyback
    // transfer is the one that needs to skip in the zero case.
    const expectedRaw = data?.ExpectedCreatorCoinReturnedNanos;
    const ccNanosExpected = (typeof expectedRaw === 'number' && Number.isFinite(expectedRaw))
      ? BigInt(Math.max(0, Math.floor(expectedRaw)))
      : BigInt(0);

    return { txHex, ccNanosExpected };
  } catch (err) {
    return {
      error: `buy-or-sell fetch threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Execute a creator-coin buyback against DeSo. Fire-and-forget contract:
 * never throws, always writes the buyback outcome to the fee_earnings
 * row (status='paid' + tx_hash on success, status='failed' + reason on
 * failure).
 *
 * Returns a discriminated union so the caller can chain a follow-up
 * action (e.g. the v2 post-buyback coin transfer to a claimed creator):
 *   - {ok: true, ccNanosReceived, txHashHex} on success
 *   - {ok: false, reason} on any failure path
 *
 * The "ccNanosReceived" value is the DeSo API's
 * ExpectedCreatorCoinReturnedNanos at construction time. Actual on-chain
 * delivery may drift by tiny amounts due to bonding-curve movement
 * between construct and broadcast; reconciliation can sweep dust later.
 */
export async function executeTokenBuyback(params: BuybackParams): Promise<BuybackResult> {
  const {
    desoPublicKey,
    amountUsd,
    feeEarningsRowId,
    platformPublicKey,
    platformSeed,
    supabase,
  } = params;

  try {
    const validation = validateBuybackInputs(params);
    if (!validation.ok) {
      console.error(
        `[buyback] input validation failed for row ${feeEarningsRowId}: ${validation.reason}`
      );
      await markFailed(supabase, feeEarningsRowId, validation.reason);
      return { ok: false, reason: validation.reason };
    }

    const rate = await fetchDesoUsdRate();
    if (!rate) {
      const reason = 'deso rate fetch returned null';
      await markFailed(supabase, feeEarningsRowId, reason);
      return { ok: false, reason };
    }

    const buyAmountNanos = usdToDesoNanos(amountUsd, rate);
    if (buyAmountNanos === null) {
      const reason = `usdToDesoNanos returned null (usd=${amountUsd}, rate=${rate})`;
      await markFailed(supabase, feeEarningsRowId, reason);
      return { ok: false, reason };
    }
    if (buyAmountNanos <= DESO_BUY_FLOOR_NANOS) {
      const reason = `buy amount below DeSo floor: ${buyAmountNanos} nanos (usd=${amountUsd}, rate=${rate})`;
      await markFailed(supabase, feeEarningsRowId, reason);
      return { ok: false, reason };
    }

    const build = await buildBuybackTxHex({
      platformPublicKey,
      desoPublicKey,
      buyAmountNanos,
    });
    if ('error' in build) {
      await markFailed(supabase, feeEarningsRowId, build.error);
      return { ok: false, reason: build.error };
    }

    const result = await signAndSubmit(build.txHex, platformSeed);
    if (!result.success) {
      const reason = `${result.stage}: ${result.error}`;
      await markFailed(supabase, feeEarningsRowId, reason);
      return { ok: false, reason };
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
      // Still return ok — the on-chain buy succeeded. Reconciliation
      // will eventually flip the row from 'pending' to 'paid' once the
      // tx hash is observable on-chain.
      return {
        ok: true,
        ccNanosReceived: build.ccNanosExpected,
        txHashHex: result.txHashHex,
      };
    }

    console.log(
      `[buyback] ✅ bought $${amountUsd} of ${desoPublicKey} for row ` +
      `${feeEarningsRowId} — tx: ${result.txHashHex} ` +
      `(${build.ccNanosExpected} CC nanos)`
    );

    return {
      ok: true,
      ccNanosReceived: build.ccNanosExpected,
      txHashHex: result.txHashHex,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[buyback] unexpected error for row ${feeEarningsRowId}:`,
      msg,
      err instanceof Error ? err.stack : undefined
    );
    try {
      await markFailed(supabase, feeEarningsRowId, `unexpected: ${msg}`);
    } catch (innerErr) {
      console.error(
        `[buyback] double-failure — couldn't even mark row as failed:`,
        innerErr instanceof Error ? innerErr.message : String(innerErr)
      );
    }
    return { ok: false, reason: `unexpected: ${msg}` };
  }
}

// ─── Post-buyback transfer (PB-5) ──────────────────────────────────

export type TransferAfterBuybackParams = {
  feeEarningsRowId: string;
  ccNanosReceived: bigint;
  creatorPublicKey: string;     // whose coin was bought (= platform's creator key)
  recipientPublicKey: string;   // creator's claimed wallet (creators.claimed_deso_key)
  platformPublicKey: string;
  platformSeed: string;
  supabase: SupabaseClient;
};

/**
 * After a successful buyback for a CLAIMED creator, transfer the bought
 * creator coins from the platform wallet to the creator's claimed wallet.
 *
 * Fire-and-forget contract: never throws, always writes coin_transfer_*
 * fields on the existing fee_earnings row (the auto-buy row whose id was
 * passed in).
 *
 * Status transitions:
 *   - ccNanosReceived === 0n → coin_transfer_status='skipped_no_amount'
 *   - transfer succeeds        → coin_transfer_status='transferred'
 *                                + coin_transfer_tx_hash + coin_transfer_at
 *   - transfer fails           → coin_transfer_status='transfer_failed'
 *                                + coin_transfer_failed_reason + coin_transfer_at
 *
 * For UNCLAIMED creators, the trade route does NOT call this function;
 * coin_transfer_status remains NULL and coins stay in the platform
 * wallet as a claim bounty.
 */
export async function transferBoughtCoinsToCreator(
  params: TransferAfterBuybackParams
): Promise<void> {
  const {
    feeEarningsRowId,
    ccNanosReceived,
    creatorPublicKey,
    recipientPublicKey,
    platformPublicKey,
    platformSeed,
    supabase,
  } = params;

  try {
    if (ccNanosReceived <= BigInt(0)) {
      await writeTransferOutcome(supabase, feeEarningsRowId, {
        coin_transfer_status: 'skipped_no_amount',
        coin_transfer_at: new Date().toISOString(),
      });
      console.warn(
        `[buyback-transfer] Skipping transfer for row ${feeEarningsRowId}: ` +
        `ExpectedCreatorCoinReturnedNanos was 0 (creator=${creatorPublicKey}). ` +
        `Reconciliation should investigate.`
      );
      return;
    }

    const result = await transferCreatorCoin({
      creatorPublicKey,
      recipientPublicKey,
      creatorCoinNanos: ccNanosReceived,
      platformPublicKey,
      platformSeed,
    });

    if (result.ok) {
      await writeTransferOutcome(supabase, feeEarningsRowId, {
        coin_transfer_status: 'transferred',
        coin_transfer_tx_hash: result.txHashHex,
        coin_transfer_at: new Date().toISOString(),
      });
      console.log(
        `[buyback-transfer] ✅ row ${feeEarningsRowId}: transferred ` +
        `${ccNanosReceived} CC nanos of ${creatorPublicKey} → ${recipientPublicKey} ` +
        `(tx=${result.txHashHex})`
      );
      return;
    }

    const reason = result.detail
      ? `${result.reason}: ${result.detail}`
      : result.reason;
    await writeTransferOutcome(supabase, feeEarningsRowId, {
      coin_transfer_status: 'transfer_failed',
      coin_transfer_failed_reason: reason,
      coin_transfer_at: new Date().toISOString(),
    });
    console.warn(
      `[buyback-transfer] row ${feeEarningsRowId} transfer failed: ${reason}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[buyback-transfer] unexpected error for row ${feeEarningsRowId}:`,
      msg,
      err instanceof Error ? err.stack : undefined
    );
    try {
      await writeTransferOutcome(supabase, feeEarningsRowId, {
        coin_transfer_status: 'transfer_failed',
        coin_transfer_failed_reason: `unexpected: ${msg}`,
        coin_transfer_at: new Date().toISOString(),
      });
    } catch (innerErr) {
      console.error(
        `[buyback-transfer] double-failure for row ${feeEarningsRowId}:`,
        innerErr instanceof Error ? innerErr.message : String(innerErr)
      );
    }
  }
}

async function writeTransferOutcome(
  supabase: SupabaseClient,
  feeEarningsRowId: string,
  patch: {
    coin_transfer_status: string;
    coin_transfer_tx_hash?: string;
    coin_transfer_at: string;
    coin_transfer_failed_reason?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('fee_earnings')
    .update(patch)
    .eq('id', feeEarningsRowId);
  if (error) {
    console.error(
      `[buyback-transfer] CRITICAL: failed to write coin_transfer_* on row ${feeEarningsRowId}:`,
      error.message
    );
  }
}
