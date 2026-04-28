/**
 * P4-4 — Coarse-grained drift detection.
 *
 * For each audit table, sum payout_amount_nanos across all claimed
 * rows. Then re-verify each row on-chain via verifyDesoTransfer and
 * sum the actual on-chain amounts. If the two sums diverge by more
 * than the tolerance threshold, log a WARN drift_alert.
 *
 * Bonus: if any individual claimed row has a tx_hash that DeSo
 * returns as NOT FOUND, that's a CRITICAL drift event — the row says
 * "we paid this," the chain says "we did not." Each gets its own
 * CRITICAL drift_alert with full forensic context.
 *
 * Coverage:
 *   ✓ position_payouts
 *   ✓ creator_claim_payouts
 *   ✓ holder_rewards (HRV-5, uses verifyCreatorCoinTransfer)
 *
 * Tolerance: network_fee_nanos × claimed_count + 1000 nanos buffer.
 * DeSo network fee is typically 168 nanos per tx.
 *
 * See docs/P4-reconciliation-design.md for full design.
 */

import { verifyDesoTransfer } from "@/lib/deso/verifyTx";
import { verifyCreatorCoinTransfer } from "@/lib/deso/verifyCreatorCoinTransfer";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Public types ────────────────────────────────────────────────

export type DriftCheckTable =
  | "position_payouts"
  | "creator_claim_payouts"
  | "holder_rewards";

export type DriftCheckTrigger = "cron" | "admin" | "manual";

export type UnmatchedRow = {
  rowId: string;
  txHash: string;
  expectedNanos: number;
  verifyReason: string;
};

export type DriftCheckResult = {
  table: DriftCheckTable;
  claimedRows: number;
  ledgerSumNanos: string;        // bigint serialized as string
  onchainSumNanos: string;       // bigint serialized as string
  diffNanos: string;             // bigint serialized as string
  toleranceNanos: string;        // bigint serialized as string
  withinThreshold: boolean;
  unmatched: UnmatchedRow[];
  errors: number;
};

export type DriftCheckOptions = {
  triggeredBy?: DriftCheckTrigger; // default "cron"
  // Optional cap on how many claimed rows to verify. Useful in
  // dry-run / manual triggers; cron should run unbounded.
  limit?: number;
};

// ── Constants ───────────────────────────────────────────────────

const NETWORK_FEE_NANOS_PER_TX = BigInt(168);
const BUFFER_NANOS = BigInt(1000);

// ── Internal helpers ────────────────────────────────────────────

type DriftAlertRow = {
  alert_type:
    | "reconciliation_action"
    | "drift_detected"
    | "verifyTx_persistent_failure";
  severity: "INFO" | "WARN" | "CRITICAL";
  table_name?: DriftCheckTable;
  row_id?: string;
  before_status?: string;
  after_status?: string;
  tx_hash?: string;
  ledger_sum_nanos?: string;
  onchain_sum_nanos?: string;
  diff_nanos?: string;
  detail?: Record<string, unknown>;
  triggered_by: DriftCheckTrigger;
};

async function recordDriftAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  alert: DriftAlertRow
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("drift_alerts")
      .insert(alert);
    if (error) {
      console.error(
        "[reconciliation/drift-check] drift_alerts insert failed:",
        error,
        "alert:",
        alert
      );
    }
  } catch (e) {
    console.error("[reconciliation/drift-check] drift_alerts threw:", e);
  }
}

function computeTolerance(claimedCount: number): bigint {
  return NETWORK_FEE_NANOS_PER_TX * BigInt(claimedCount) + BUFFER_NANOS;
}

function abs(n: bigint): bigint {
  return n < BigInt(0) ? -n : n;
}

// ── position_payouts drift check ────────────────────────────────

type PositionPayoutDriftRow = {
  id: string;
  user_id: string;
  payout_amount_nanos: string | number | null;
  claim_tx_hash: string | null;
  user_deso_public_key: string;
};

export async function driftCheckPositionPayouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: DriftCheckOptions = {}
): Promise<DriftCheckResult> {
  const triggeredBy: DriftCheckTrigger = options.triggeredBy ?? "cron";
  const limit = options.limit;

  const result: DriftCheckResult = {
    table: "position_payouts",
    claimedRows: 0,
    ledgerSumNanos: "0",
    onchainSumNanos: "0",
    diffNanos: "0",
    toleranceNanos: "0",
    withinThreshold: true,
    unmatched: [],
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/drift-check] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  // Fetch all claimed rows with tx_hash (skip rows missing the hash —
  // they're state-machine bugs, not drift candidates).
  let query =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("position_payouts")
      .select(
        `id, user_id, payout_amount_nanos, claim_tx_hash,
         users!inner(deso_public_key)`
      )
      .eq("claim_status", "claimed")
      .not("claim_tx_hash", "is", null);

  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error: fetchErr } = await query;

  if (fetchErr) {
    console.error(
      "[reconciliation/drift-check] position_payouts fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  // Normalize joined column
  type FetchedRow = Omit<PositionPayoutDriftRow, "user_deso_public_key"> & {
    users: { deso_public_key: string } | null;
  };
  const normalized: PositionPayoutDriftRow[] = (rows as FetchedRow[])
    .filter((r) => r.users?.deso_public_key)
    .map((r) => ({
      ...r,
      user_deso_public_key: r.users!.deso_public_key,
    }));

  let ledgerSum = BigInt(0);
  let onchainSum = BigInt(0);

  for (const row of normalized) {
    if (row.payout_amount_nanos == null || !row.claim_tx_hash) {
      // Already filtered by query but defensive
      continue;
    }
    result.claimedRows++;
    const expectedNanos = Number(row.payout_amount_nanos);

    let verifyResult;
    try {
      verifyResult = await verifyDesoTransfer(
        row.claim_tx_hash,
        platformPubkey,
        row.user_deso_public_key,
        expectedNanos
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/drift-check] verify threw for row:",
        row.id,
        e
      );
      continue;
    }

    if (verifyResult.ok) {
      // Both sums get this row — confirmed match.
      ledgerSum += BigInt(row.payout_amount_nanos!);
      onchainSum += BigInt(verifyResult.actualAmountNanos);
    } else {
      // Drift signal: claimed row, but verifyTx says no
      if (verifyResult.reason === "tx-not-found") {
        // Real drift signal: ledger says we paid, chain says we didn't.
        // Add to ledgerSum so the coarse-sum check ALSO flags it.
        ledgerSum += BigInt(row.payout_amount_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.claim_tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "position_payouts",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.claim_tx_hash,
          detail: {
            reason: "claimed row has tx_hash that DeSo cannot find",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_nanos: expectedNanos,
            user_deso_public_key: row.user_deso_public_key,
          },
          triggered_by: triggeredBy,
        });
      } else if (verifyResult.reason === "deso-api-unreachable") {
        // Don't sample-bias the on-chain sum; treat as error.
        result.errors++;
      } else {
        // sender-mismatch, recipient-not-found, amount-too-low, etc.
        // The row is in 'claimed' but on-chain says it doesn't match.
        // Real drift signal. Add to ledgerSum.
        // CRITICAL drift.
        ledgerSum += BigInt(row.payout_amount_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.claim_tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "position_payouts",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.claim_tx_hash,
          detail: {
            reason:
              "claimed row tx mismatch (recipient/amount/sender or other)",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_nanos: expectedNanos,
            user_deso_public_key: row.user_deso_public_key,
          },
          triggered_by: triggeredBy,
        });
      }
    }
  }

  const diff = abs(ledgerSum - onchainSum);
  const tolerance = computeTolerance(result.claimedRows);
  const withinThreshold = diff <= tolerance;

  result.ledgerSumNanos = ledgerSum.toString();
  result.onchainSumNanos = onchainSum.toString();
  result.diffNanos = diff.toString();
  result.toleranceNanos = tolerance.toString();
  result.withinThreshold = withinThreshold;

  if (!withinThreshold) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "WARN",
      table_name: "position_payouts",
      ledger_sum_nanos: result.ledgerSumNanos,
      onchain_sum_nanos: result.onchainSumNanos,
      diff_nanos: result.diffNanos,
      detail: {
        reason: "ledger vs on-chain sum exceeds tolerance",
        claimed_rows: result.claimedRows,
        tolerance_nanos: result.toleranceNanos,
        unmatched_count: result.unmatched.length,
      },
      triggered_by: triggeredBy,
    });
  }

  return result;
}

// ── creator_claim_payouts drift check ───────────────────────────

type CreatorClaimDriftRow = {
  id: string;
  creator_id: string;
  amount_nanos: string | number | null;
  tx_hash: string | null;
  creator_deso_public_key: string;
};

export async function driftCheckCreatorClaimPayouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: DriftCheckOptions = {}
): Promise<DriftCheckResult> {
  const triggeredBy: DriftCheckTrigger = options.triggeredBy ?? "cron";
  const limit = options.limit;

  const result: DriftCheckResult = {
    table: "creator_claim_payouts",
    claimedRows: 0,
    ledgerSumNanos: "0",
    onchainSumNanos: "0",
    diffNanos: "0",
    toleranceNanos: "0",
    withinThreshold: true,
    unmatched: [],
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/drift-check] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  let query =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("creator_claim_payouts")
      .select(
        `id, creator_id, amount_nanos, tx_hash,
         creators!inner(deso_public_key)`
      )
      .eq("status", "claimed")
      .not("tx_hash", "is", null);

  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error: fetchErr } = await query;

  if (fetchErr) {
    console.error(
      "[reconciliation/drift-check] creator_claim_payouts fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  type FetchedRow = Omit<
    CreatorClaimDriftRow,
    "creator_deso_public_key"
  > & {
    creators: { deso_public_key: string } | null;
  };
  const normalized: CreatorClaimDriftRow[] = (rows as FetchedRow[])
    .filter((r) => r.creators?.deso_public_key)
    .map((r) => ({
      ...r,
      creator_deso_public_key: r.creators!.deso_public_key,
    }));

  let ledgerSum = BigInt(0);
  let onchainSum = BigInt(0);

  for (const row of normalized) {
    if (row.amount_nanos == null || !row.tx_hash) {
      continue;
    }
    result.claimedRows++;
    const expectedNanos = Number(row.amount_nanos);

    let verifyResult;
    try {
      verifyResult = await verifyDesoTransfer(
        row.tx_hash,
        platformPubkey,
        row.creator_deso_public_key,
        expectedNanos
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/drift-check] verify threw for row:",
        row.id,
        e
      );
      continue;
    }

    if (verifyResult.ok) {
      ledgerSum += BigInt(row.amount_nanos!);
      onchainSum += BigInt(verifyResult.actualAmountNanos);
    } else {
      if (verifyResult.reason === "tx-not-found") {
        // Real drift signal — add to ledgerSum.
        ledgerSum += BigInt(row.amount_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "creator_claim_payouts",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.tx_hash,
          detail: {
            reason: "claimed row has tx_hash that DeSo cannot find",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_nanos: expectedNanos,
            creator_deso_public_key: row.creator_deso_public_key,
          },
          triggered_by: triggeredBy,
        });
      } else if (verifyResult.reason === "deso-api-unreachable") {
        result.errors++;
      } else {
        // Real drift signal — add to ledgerSum.
        ledgerSum += BigInt(row.amount_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "creator_claim_payouts",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.tx_hash,
          detail: {
            reason:
              "claimed row tx mismatch (recipient/amount/sender or other)",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_nanos: expectedNanos,
            creator_deso_public_key: row.creator_deso_public_key,
          },
          triggered_by: triggeredBy,
        });
      }
    }
  }

  const diff = abs(ledgerSum - onchainSum);
  const tolerance = computeTolerance(result.claimedRows);
  const withinThreshold = diff <= tolerance;

  result.ledgerSumNanos = ledgerSum.toString();
  result.onchainSumNanos = onchainSum.toString();
  result.diffNanos = diff.toString();
  result.toleranceNanos = tolerance.toString();
  result.withinThreshold = withinThreshold;

  if (!withinThreshold) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "WARN",
      table_name: "creator_claim_payouts",
      ledger_sum_nanos: result.ledgerSumNanos,
      onchain_sum_nanos: result.onchainSumNanos,
      diff_nanos: result.diffNanos,
      detail: {
        reason: "ledger vs on-chain sum exceeds tolerance",
        claimed_rows: result.claimedRows,
        tolerance_nanos: result.toleranceNanos,
        unmatched_count: result.unmatched.length,
      },
      triggered_by: triggeredBy,
    });
  }

  return result;
}

// ── holder_rewards drift check ──────────────────────────────────

type HolderRewardDriftRow = {
  id: string;
  holder_deso_public_key: string;
  token_slug: string;
  amount_creator_coin_nanos: string | number | null;
  claimed_tx_hash: string | null;
};

/**
 * Coarse drift check for holder_rewards.
 *
 * Selects all rows in 'claimed' status with a non-null claimed_tx_hash.
 * For each row, calls verifyCreatorCoinTransfer to confirm the
 * on-chain CREATOR_COIN_TRANSFER matches the ledger entry. Sums
 * are accumulated in CREATOR COIN NANOS, not DESO nanos.
 *
 * Per-row CRITICAL drift_alerts on tx_hash mismatches (chain says
 * "didn't happen" or "wrong sender/recipient/amount/coin"). Coarse
 * WARN drift_alert if the ledger-vs-onchain sum diverges past
 * tolerance.
 *
 * Note on amount comparison: unlike DESO transfers which use >= for
 * rate drift absorption, creator coin transfers are exact-match
 * verified. Successful verify means actualAmountNanos === expected.
 * The tolerance formula is reused from the DESO siblings for code
 * symmetry, but creator coin drift should in practice always be zero
 * for confirmed rows; only deso-api-unreachable errors create gaps.
 */
export async function driftCheckHolderRewards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: DriftCheckOptions = {}
): Promise<DriftCheckResult> {
  const triggeredBy: DriftCheckTrigger = options.triggeredBy ?? "cron";
  const limit = options.limit;

  const result: DriftCheckResult = {
    table: "holder_rewards",
    claimedRows: 0,
    ledgerSumNanos: "0",
    onchainSumNanos: "0",
    diffNanos: "0",
    toleranceNanos: "0",
    withinThreshold: true,
    unmatched: [],
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/drift-check] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  // No JOIN needed — holder_deso_public_key + token_slug live on
  // holder_rewards directly.
  let query =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("holder_rewards")
      .select(
        "id, holder_deso_public_key, token_slug, amount_creator_coin_nanos, claimed_tx_hash"
      )
      .eq("status", "claimed")
      .not("claimed_tx_hash", "is", null);

  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error: fetchErr } = await query;

  if (fetchErr) {
    console.error(
      "[reconciliation/drift-check] holder_rewards fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  let ledgerSum = BigInt(0);
  let onchainSum = BigInt(0);

  for (const row of rows as HolderRewardDriftRow[]) {
    if (row.amount_creator_coin_nanos == null || !row.claimed_tx_hash) {
      // Already filtered by query but defensive
      continue;
    }
    result.claimedRows++;
    const expectedNanos = Number(row.amount_creator_coin_nanos);

    let verifyResult;
    try {
      verifyResult = await verifyCreatorCoinTransfer(
        row.claimed_tx_hash,
        platformPubkey,
        row.holder_deso_public_key,
        row.token_slug,
        expectedNanos
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/drift-check] verify threw for row:",
        row.id,
        e
      );
      continue;
    }

    if (verifyResult.ok) {
      ledgerSum += BigInt(row.amount_creator_coin_nanos!);
      onchainSum += BigInt(verifyResult.actualAmountNanos);
    } else {
      if (verifyResult.reason === "tx-not-found") {
        // Real drift signal — add to ledgerSum so coarse-sum check ALSO flags.
        ledgerSum += BigInt(row.amount_creator_coin_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.claimed_tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "holder_rewards",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.claimed_tx_hash,
          detail: {
            reason: "claimed row has tx_hash that DeSo cannot find",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_creator_coin_nanos: expectedNanos,
            holder_deso_public_key: row.holder_deso_public_key,
            token_slug: row.token_slug,
          },
          triggered_by: triggeredBy,
        });
      } else if (verifyResult.reason === "deso-api-unreachable") {
        // Don't sample-bias the on-chain sum; treat as error.
        result.errors++;
      } else {
        // sender-mismatch, recipient-not-found, creator-username-mismatch,
        // amount-mismatch, tx-not-creator-coin-transfer, etc.
        // The row is in 'claimed' but on-chain says it doesn't match.
        // Real drift signal — add to ledgerSum.
        ledgerSum += BigInt(row.amount_creator_coin_nanos!);
        result.unmatched.push({
          rowId: row.id,
          txHash: row.claimed_tx_hash,
          expectedNanos,
          verifyReason: verifyResult.reason,
        });
        await recordDriftAlert(supabase, {
          alert_type: "drift_detected",
          severity: "CRITICAL",
          table_name: "holder_rewards",
          row_id: row.id,
          before_status: "claimed",
          tx_hash: row.claimed_tx_hash,
          detail: {
            reason:
              "claimed row tx mismatch (recipient/amount/coin/sender or other)",
            verify_reason: verifyResult.reason,
            verify_detail: verifyResult.detail,
            expected_creator_coin_nanos: expectedNanos,
            holder_deso_public_key: row.holder_deso_public_key,
            token_slug: row.token_slug,
          },
          triggered_by: triggeredBy,
        });
      }
    }
  }

  const diff = abs(ledgerSum - onchainSum);
  const tolerance = computeTolerance(result.claimedRows);
  const withinThreshold = diff <= tolerance;

  result.ledgerSumNanos = ledgerSum.toString();
  result.onchainSumNanos = onchainSum.toString();
  result.diffNanos = diff.toString();
  result.toleranceNanos = tolerance.toString();
  result.withinThreshold = withinThreshold;

  if (!withinThreshold) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "WARN",
      table_name: "holder_rewards",
      ledger_sum_nanos: result.ledgerSumNanos,
      onchain_sum_nanos: result.onchainSumNanos,
      diff_nanos: result.diffNanos,
      detail: {
        reason:
          "ledger vs on-chain sum exceeds tolerance (CREATOR COIN NANOS)",
        claimed_rows: result.claimedRows,
        tolerance_nanos: result.toleranceNanos,
        unmatched_count: result.unmatched.length,
      },
      triggered_by: triggeredBy,
    });
  }

  return result;
}
