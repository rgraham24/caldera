/**
 * lib/deso/transaction.ts
 *
 * Shared helpers for signing and submitting DeSo transactions from
 * server-side code. Wraps the low-level signTransactionWithSeed from
 * @/lib/deso/server-sign and the DeSo submit-transaction HTTP endpoint.
 *
 * This module is server-only — it imports signTransactionWithSeed
 * statically and is not safe to import from client components.
 *
 * Callers:
 *   - lib/deso/buyback.ts (3d.2c) — auto-buy execution
 *   - Future: app/api/trades/sell/route.ts and admin import routes
 *     (post-merge cleanup; they currently inline the pattern)
 */

import { signTransactionWithSeed } from '@/lib/deso/server-sign';
import { DESO_API_BASE } from '@/lib/deso/rate';

// ─── Types ─────────────────────────────────────────────────────────

/**
 * Result of signAndSubmit.
 *
 * Tagged union lets callers tell WHERE the failure happened:
 * - stage: 'sign'   → crypto/seed problem, usually platform-side
 * - stage: 'submit' → DeSo network or validation problem
 *
 * Different recovery strategies per stage; callers should record
 * the failure reason (including stage) into any ledger row.
 */
export type SignAndSubmitResult =
  | { success: true;  txHashHex: string }
  | { success: false; stage: 'sign' | 'submit'; error: string };

// ─── signTransaction ───────────────────────────────────────────────

/**
 * Sign a pre-built DeSo transaction hex using a BIP39 mnemonic seed.
 *
 * Thin typed wrapper around the core signTransactionWithSeed util.
 * Throws on invalid input (empty hex, bad seed, crypto errors).
 * Callers that need non-throwing behavior should use signAndSubmit.
 */
export async function signTransaction(
  txHex: string,
  seed: string
): Promise<string> {
  if (!txHex || typeof txHex !== 'string') {
    throw new Error('signTransaction: txHex must be a non-empty string');
  }
  if (!seed || typeof seed !== 'string') {
    throw new Error('signTransaction: seed must be a non-empty string');
  }
  return await signTransactionWithSeed(txHex, seed);
}

// ─── submitTransaction ─────────────────────────────────────────────

/**
 * POST a signed transaction hex to DeSo's submit-transaction endpoint.
 *
 * Returns the TxnHashHex on success. Throws on:
 * - Non-OK HTTP response (includes DeSo's error body in the message)
 * - Network/JSON parsing error
 * - Missing TxnHashHex in response
 */
export async function submitTransaction(signedTxHex: string): Promise<string> {
  if (!signedTxHex || typeof signedTxHex !== 'string') {
    throw new Error('submitTransaction: signedTxHex must be a non-empty string');
  }

  const response = await fetch(`${DESO_API_BASE}/api/v0/submit-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TransactionHex: signedTxHex }),
  });

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(
      `submitTransaction: DeSo returned ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const data = await response.json();
  const txHashHex = data?.TxnHashHex;
  if (!txHashHex || typeof txHashHex !== 'string') {
    throw new Error(
      `submitTransaction: response missing TxnHashHex: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  return txHashHex;
}

// ─── signAndSubmit ─────────────────────────────────────────────────

/**
 * Sign and submit a DeSo transaction in one call.
 *
 * Never throws — returns a tagged result. Designed for callers that
 * need to record failures to a ledger (e.g. fee_earnings.failed_reason)
 * and don't want a bare exception bubbling out of a fire-and-forget path.
 */
export async function signAndSubmit(
  txHex: string,
  seed: string
): Promise<SignAndSubmitResult> {
  // Sign stage
  let signedHex: string;
  try {
    signedHex = await signTransaction(txHex, seed);
  } catch (err) {
    return {
      success: false,
      stage: 'sign',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Submit stage
  try {
    const txHashHex = await submitTransaction(signedHex);
    return { success: true, txHashHex };
  } catch (err) {
    return {
      success: false,
      stage: 'submit',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
