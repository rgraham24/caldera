/**
 * P4-3 — Reconciliation sweep for stuck in_flight rows.
 *
 * Detects rows that have been in_flight longer than the staleness
 * threshold. For each, calls verifyDesoTransfer to check the on-chain
 * state, then transitions the row to its rightful terminal status:
 *
 *   ok: true + blockHashHex set     → claimed
 *   ok: true + blockHashHex === null → leave in_flight (still pending)
 *   ok: false, tx-not-found          → failed
 *   ok: false, deso-api-unreachable  → leave in_flight (retry)
 *   ok: false, any other reason      → CRITICAL drift_alert + leave alone
 *
 * Every action writes a drift_alerts row for forensics.
 *
 * Coverage:
 *   ✓ position_payouts (P4-3)
 *   ✓ creator_claim_payouts (P4-3)
 *   ✗ holder_rewards (deferred — needs verifyCreatorCoinTransfer
 *     primitive that doesn't exist yet. Tracked as Phase 4.5 or 5.)
 *
 * See docs/P4-reconciliation-design.md for full design.
 */

import { verifyDesoTransfer } from "@/lib/deso/verifyTx";
import { verifyCreatorCoinTransfer } from "@/lib/deso/verifyCreatorCoinTransfer";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Public types ────────────────────────────────────────────────

export type SweepTable =
  | "position_payouts"
  | "creator_claim_payouts"
  | "holder_rewards";

export type SweepTrigger = "cron" | "admin" | "manual";

export type SweepResult = {
  table: SweepTable;
  swept: number;        // rows examined
  confirmed: number;    // verifyTx ok+block → marked claimed
  failed: number;       // tx-not-found → marked failed
  stillPending: number; // ok+no-block, or api-unreachable → unchanged
  driftAlerts: number;  // CRITICAL drift events flagged for human review
  errors: number;       // unexpected errors during sweep itself
};

export type SweepOptions = {
  staleMinutes?: number;  // default 15
  limit?: number;         // default 50
  triggeredBy?: SweepTrigger;  // default "cron"
};

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_LIMIT = 50;

// ── Internal types ──────────────────────────────────────────────

type DriftAlertRow = {
  alert_type:
    | "reconciliation_action"
    | "drift_detected"
    | "verifyTx_persistent_failure";
  severity: "INFO" | "WARN" | "CRITICAL";
  table_name?: SweepTable;
  row_id?: string;
  before_status?: string;
  after_status?: string;
  tx_hash?: string;
  detail?: Record<string, unknown>;
  triggered_by: SweepTrigger;
};

// What sweep should do given a verifyTx outcome
type SweepDecision =
  | { kind: "mark_claimed"; severity: "INFO" }
  | { kind: "mark_failed"; reason: string; severity: "WARN" }
  | { kind: "leave_pending_chain_pending"; severity: "INFO" }
  | { kind: "leave_pending_api_down"; severity: "WARN" }
  | { kind: "drift_critical"; reason: string; detail: string };

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Map a verifyDesoTransfer outcome to a sweep decision.
 * Pure function — easy to unit test.
 */
export function mapVerifyOutcome(
  result: Awaited<ReturnType<typeof verifyDesoTransfer>>
): SweepDecision {
  if (result.ok) {
    if (result.blockHashHex) {
      return { kind: "mark_claimed", severity: "INFO" };
    }
    return { kind: "leave_pending_chain_pending", severity: "INFO" };
  }
  // result.ok === false
  switch (result.reason) {
    case "tx-not-found":
      return {
        kind: "mark_failed",
        reason: "reconciliation: tx not found on chain",
        severity: "WARN",
      };
    case "deso-api-unreachable":
      return { kind: "leave_pending_api_down", severity: "WARN" };
    // Everything else (sender-mismatch, recipient-not-found,
    // amount-too-low, tx-not-basic-transfer, invalid-hex,
    // invalid-encoding) means our ledger is inconsistent with the
    // on-chain state. Don't auto-transition. Log CRITICAL.
    default:
      return {
        kind: "drift_critical",
        reason: result.reason,
        detail: result.detail ?? "no detail",
      };
  }
}

/**
 * Map a verifyCreatorCoinTransfer outcome to a sweep decision.
 * Pure function — easy to unit test.
 *
 * Sister of mapVerifyOutcome. The decision shape is identical
 * (mark_claimed / mark_failed / leave_pending / drift_critical)
 * but the recoverable reasons differ (creator coin verifier has
 * different fail reasons).
 */
export function mapCctVerifyOutcome(
  result: Awaited<ReturnType<typeof verifyCreatorCoinTransfer>>
): SweepDecision {
  if (result.ok) {
    if (result.blockHashHex) {
      return { kind: "mark_claimed", severity: "INFO" };
    }
    return { kind: "leave_pending_chain_pending", severity: "INFO" };
  }
  // result.ok === false
  switch (result.reason) {
    case "tx-not-found":
      return {
        kind: "mark_failed",
        reason: "reconciliation: tx not found on chain",
        severity: "WARN",
      };
    case "deso-api-unreachable":
      return { kind: "leave_pending_api_down", severity: "WARN" };
    // Everything else (sender-mismatch, recipient-not-found,
    // creator-username-mismatch, amount-mismatch,
    // tx-not-creator-coin-transfer, invalid-hex, invalid-encoding)
    // means our ledger is inconsistent with the on-chain state.
    // Don't auto-transition. Log CRITICAL.
    default:
      return {
        kind: "drift_critical",
        reason: result.reason,
        detail: result.detail ?? "no detail",
      };
  }
}

/**
 * Insert a drift_alerts row. Best-effort: logs but does not throw
 * if the insert itself fails (would defeat reconciliation).
 */
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
        "[reconciliation/sweep] drift_alerts insert failed:",
        error,
        "alert:",
        alert
      );
    }
  } catch (e) {
    console.error("[reconciliation/sweep] drift_alerts threw:", e);
  }
}

// ── position_payouts sweep ──────────────────────────────────────

type PositionPayoutSweepRow = {
  id: string;
  position_id: string;
  user_id: string;
  payout_amount_nanos: string | number | null;
  claim_tx_hash: string | null;
  claim_status: string;
  user_deso_public_key: string;
};

/**
 * Sweep stale in_flight position_payouts rows.
 *
 * Recipient is users.deso_public_key (joined). Amount is
 * payout_amount_nanos. Sender is the platform wallet.
 */
export async function sweepPositionPayouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: SweepOptions = {}
): Promise<SweepResult> {
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const triggeredBy: SweepTrigger = options.triggeredBy ?? "cron";

  const result: SweepResult = {
    table: "position_payouts",
    swept: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
    driftAlerts: 0,
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/sweep] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  const cutoffIso = new Date(
    Date.now() - staleMinutes * 60_000
  ).toISOString();

  // SELECT stale in_flight rows + JOIN to users for recipient pubkey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fetchErr } = await (supabase as any)
    .from("position_payouts")
    .select(
      `id, position_id, user_id, payout_amount_nanos, claim_tx_hash, claim_status,
       users!inner(deso_public_key)`
    )
    .eq("claim_status", "in_flight")
    .lt("resolved_at", cutoffIso) // sweep rows created (resolved) > staleMinutes ago
    .limit(limit);

  if (fetchErr) {
    console.error(
      "[reconciliation/sweep] position_payouts fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  // Normalize: lift joined user.deso_public_key to top-level
  type FetchedRow = Omit<PositionPayoutSweepRow, "user_deso_public_key"> & {
    users: { deso_public_key: string } | null;
  };
  const normalized: PositionPayoutSweepRow[] = (rows as FetchedRow[])
    .filter((r) => r.users?.deso_public_key)
    .map((r) => ({
      ...r,
      user_deso_public_key: r.users!.deso_public_key,
    }));

  for (const row of normalized) {
    result.swept++;
    try {
      await processPositionPayoutRow(
        supabase,
        row,
        platformPubkey,
        triggeredBy,
        result
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/sweep] position_payouts row error:",
        row.id,
        e
      );
    }
  }

  return result;
}

async function processPositionPayoutRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  row: PositionPayoutSweepRow,
  platformPubkey: string,
  triggeredBy: SweepTrigger,
  result: SweepResult
): Promise<void> {
  // Sanity: must have tx_hash and amount to verify
  if (!row.claim_tx_hash || row.payout_amount_nanos == null) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "CRITICAL",
      table_name: "position_payouts",
      row_id: row.id,
      before_status: row.claim_status,
      detail: {
        reason: "in_flight row missing tx_hash or amount_nanos",
        claim_tx_hash: row.claim_tx_hash,
        payout_amount_nanos: row.payout_amount_nanos,
      },
      triggered_by: triggeredBy,
    });
    result.driftAlerts++;
    return;
  }

  const amountNanos = Number(row.payout_amount_nanos);
  const verifyResult = await verifyDesoTransfer(
    row.claim_tx_hash,
    platformPubkey,
    row.user_deso_public_key,
    amountNanos
  );
  const decision = mapVerifyOutcome(verifyResult);

  switch (decision.kind) {
    case "mark_claimed": {
      // Idempotent UPDATE: only if still in_flight
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("position_payouts")
        .update({
          claim_status: "claimed",
          claimed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("claim_status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] mark_claimed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.confirmed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "position_payouts",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "claimed",
          tx_hash: row.claim_tx_hash,
          detail: { action: "confirmed_via_sweep" },
          triggered_by: triggeredBy,
        });
      }
      // If transitioned === false: a concurrent sweep beat us. Silent skip.
      return;
    }

    case "mark_failed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("position_payouts")
        .update({
          claim_status: "failed",
          claim_failed_reason: decision.reason,
        })
        .eq("id", row.id)
        .eq("claim_status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] mark_failed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.failed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "position_payouts",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "failed",
          tx_hash: row.claim_tx_hash,
          detail: { action: "tx_not_found_via_sweep" },
          triggered_by: triggeredBy,
        });
      }
      return;
    }

    case "leave_pending_chain_pending":
    case "leave_pending_api_down": {
      result.stillPending++;
      // No row update. Optionally log INFO/WARN for visibility.
      await recordDriftAlert(supabase, {
        alert_type: "reconciliation_action",
        severity: decision.severity,
        table_name: "position_payouts",
        row_id: row.id,
        before_status: "in_flight",
        after_status: "in_flight",
        tx_hash: row.claim_tx_hash,
        detail: {
          action:
            decision.kind === "leave_pending_chain_pending"
              ? "tx_pending_on_chain"
              : "deso_api_unreachable",
        },
        triggered_by: triggeredBy,
      });
      return;
    }

    case "drift_critical": {
      result.driftAlerts++;
      await recordDriftAlert(supabase, {
        alert_type: "drift_detected",
        severity: "CRITICAL",
        table_name: "position_payouts",
        row_id: row.id,
        before_status: "in_flight",
        tx_hash: row.claim_tx_hash,
        detail: {
          verify_reason: decision.reason,
          verify_detail: decision.detail,
          payout_amount_nanos: row.payout_amount_nanos,
          user_deso_public_key: row.user_deso_public_key,
          action: "left_alone_human_review_required",
        },
        triggered_by: triggeredBy,
      });
      return;
    }
  }
}

// ── creator_claim_payouts sweep ─────────────────────────────────

type CreatorClaimPayoutSweepRow = {
  id: string;
  creator_id: string;
  amount_nanos: string | number | null;
  tx_hash: string | null;
  status: string;
  creator_deso_public_key: string;
};

export async function sweepCreatorClaimPayouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: SweepOptions = {}
): Promise<SweepResult> {
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const triggeredBy: SweepTrigger = options.triggeredBy ?? "cron";

  const result: SweepResult = {
    table: "creator_claim_payouts",
    swept: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
    driftAlerts: 0,
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/sweep] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  const cutoffIso = new Date(
    Date.now() - staleMinutes * 60_000
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fetchErr } = await (supabase as any)
    .from("creator_claim_payouts")
    .select(
      `id, creator_id, amount_nanos, tx_hash, status, created_at,
       creators!inner(deso_public_key)`
    )
    .eq("status", "in_flight")
    .lt("created_at", cutoffIso)
    .limit(limit);

  if (fetchErr) {
    console.error(
      "[reconciliation/sweep] creator_claim_payouts fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  type FetchedRow = Omit<
    CreatorClaimPayoutSweepRow,
    "creator_deso_public_key"
  > & {
    creators: { deso_public_key: string } | null;
  };
  const normalized: CreatorClaimPayoutSweepRow[] = (rows as FetchedRow[])
    .filter((r) => r.creators?.deso_public_key)
    .map((r) => ({
      ...r,
      creator_deso_public_key: r.creators!.deso_public_key,
    }));

  for (const row of normalized) {
    result.swept++;
    try {
      await processCreatorClaimPayoutRow(
        supabase,
        row,
        platformPubkey,
        triggeredBy,
        result
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/sweep] creator_claim_payouts row error:",
        row.id,
        e
      );
    }
  }

  return result;
}

async function processCreatorClaimPayoutRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  row: CreatorClaimPayoutSweepRow,
  platformPubkey: string,
  triggeredBy: SweepTrigger,
  result: SweepResult
): Promise<void> {
  if (!row.tx_hash || row.amount_nanos == null) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "CRITICAL",
      table_name: "creator_claim_payouts",
      row_id: row.id,
      before_status: row.status,
      detail: {
        reason: "in_flight row missing tx_hash or amount_nanos",
        tx_hash: row.tx_hash,
        amount_nanos: row.amount_nanos,
      },
      triggered_by: triggeredBy,
    });
    result.driftAlerts++;
    return;
  }

  const amountNanos = Number(row.amount_nanos);
  const verifyResult = await verifyDesoTransfer(
    row.tx_hash,
    platformPubkey,
    row.creator_deso_public_key,
    amountNanos
  );
  const decision = mapVerifyOutcome(verifyResult);

  switch (decision.kind) {
    case "mark_claimed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("creator_claim_payouts")
        .update({
          status: "claimed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] mark_claimed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.confirmed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "creator_claim_payouts",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "claimed",
          tx_hash: row.tx_hash,
          detail: { action: "confirmed_via_sweep" },
          triggered_by: triggeredBy,
        });
      }
      return;
    }

    case "mark_failed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("creator_claim_payouts")
        .update({
          status: "failed",
          error_reason: decision.reason,
        })
        .eq("id", row.id)
        .eq("status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] mark_failed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.failed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "creator_claim_payouts",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "failed",
          tx_hash: row.tx_hash,
          detail: { action: "tx_not_found_via_sweep" },
          triggered_by: triggeredBy,
        });
      }
      return;
    }

    case "leave_pending_chain_pending":
    case "leave_pending_api_down": {
      result.stillPending++;
      await recordDriftAlert(supabase, {
        alert_type: "reconciliation_action",
        severity: decision.severity,
        table_name: "creator_claim_payouts",
        row_id: row.id,
        before_status: "in_flight",
        after_status: "in_flight",
        tx_hash: row.tx_hash,
        detail: {
          action:
            decision.kind === "leave_pending_chain_pending"
              ? "tx_pending_on_chain"
              : "deso_api_unreachable",
        },
        triggered_by: triggeredBy,
      });
      return;
    }

    case "drift_critical": {
      result.driftAlerts++;
      await recordDriftAlert(supabase, {
        alert_type: "drift_detected",
        severity: "CRITICAL",
        table_name: "creator_claim_payouts",
        row_id: row.id,
        before_status: "in_flight",
        tx_hash: row.tx_hash,
        detail: {
          verify_reason: decision.reason,
          verify_detail: decision.detail,
          amount_nanos: row.amount_nanos,
          creator_deso_public_key: row.creator_deso_public_key,
          action: "left_alone_human_review_required",
        },
        triggered_by: triggeredBy,
      });
      return;
    }
  }
}

// ── holder_rewards sweep ────────────────────────────────────────

type HolderRewardSweepRow = {
  id: string;
  holder_deso_public_key: string;
  token_slug: string;
  amount_creator_coin_nanos: string | number | null;
  claimed_tx_hash: string | null;
  status: string;
};

/**
 * Sweep stale in_flight holder_rewards rows.
 *
 * Recipient is holder_deso_public_key (already on the row, no JOIN).
 * Amount is amount_creator_coin_nanos. Sender is the platform wallet.
 * Coin is identified by token_slug (compared case-insensitively
 * against the on-chain CreatorUsername).
 *
 * Uses verifyCreatorCoinTransfer (HRV-2) instead of verifyDesoTransfer
 * because holder rewards are paid in creator coins, not DESO.
 *
 * Note on staleness cutoff: holder_rewards has no claimed_at-set-at-
 * in_flight column, so we use accrued_at (the row's birth timestamp).
 * Worst case is sweeping a row that just transitioned in_flight whose
 * accrued_at is old; the verifier handles both confirmed and pending
 * outcomes correctly so this is harmless.
 *
 * Failure reason is NOT written to the row (no error_reason column on
 * holder_rewards). The reason is captured in drift_alerts.detail for
 * forensics.
 */
export async function sweepHolderRewards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  options: SweepOptions = {}
): Promise<SweepResult> {
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const triggeredBy: SweepTrigger = options.triggeredBy ?? "cron";

  const result: SweepResult = {
    table: "holder_rewards",
    swept: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
    driftAlerts: 0,
    errors: 0,
  };

  const platformPubkey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  if (!platformPubkey) {
    console.error(
      "[reconciliation/sweep] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    result.errors = 1;
    return result;
  }

  const cutoffIso = new Date(
    Date.now() - staleMinutes * 60_000
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fetchErr } = await (supabase as any)
    .from("holder_rewards")
    .select(
      "id, holder_deso_public_key, token_slug, amount_creator_coin_nanos, claimed_tx_hash, status"
    )
    .eq("status", "in_flight")
    .lt("accrued_at", cutoffIso)
    .limit(limit);

  if (fetchErr) {
    console.error(
      "[reconciliation/sweep] holder_rewards fetch failed:",
      fetchErr
    );
    result.errors = 1;
    return result;
  }

  if (!rows || rows.length === 0) {
    return result;
  }

  for (const row of rows as HolderRewardSweepRow[]) {
    result.swept++;
    try {
      await processHolderRewardRow(
        supabase,
        row,
        platformPubkey,
        triggeredBy,
        result
      );
    } catch (e) {
      result.errors++;
      console.error(
        "[reconciliation/sweep] holder_rewards row error:",
        row.id,
        e
      );
    }
  }

  return result;
}

async function processHolderRewardRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  row: HolderRewardSweepRow,
  platformPubkey: string,
  triggeredBy: SweepTrigger,
  result: SweepResult
): Promise<void> {
  // Sanity: must have tx_hash and amount to verify
  if (!row.claimed_tx_hash || row.amount_creator_coin_nanos == null) {
    await recordDriftAlert(supabase, {
      alert_type: "drift_detected",
      severity: "CRITICAL",
      table_name: "holder_rewards",
      row_id: row.id,
      before_status: row.status,
      detail: {
        reason: "in_flight row missing claimed_tx_hash or amount_creator_coin_nanos",
        claimed_tx_hash: row.claimed_tx_hash,
        amount_creator_coin_nanos: row.amount_creator_coin_nanos,
      },
      triggered_by: triggeredBy,
    });
    result.driftAlerts++;
    return;
  }

  const amountNanos = Number(row.amount_creator_coin_nanos);
  const verifyResult = await verifyCreatorCoinTransfer(
    row.claimed_tx_hash,
    platformPubkey,
    row.holder_deso_public_key,
    row.token_slug,
    amountNanos
  );
  const decision = mapCctVerifyOutcome(verifyResult);

  switch (decision.kind) {
    case "mark_claimed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("holder_rewards")
        .update({
          status: "claimed",
          claimed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] holder_rewards mark_claimed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.confirmed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "holder_rewards",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "claimed",
          tx_hash: row.claimed_tx_hash,
          detail: { action: "confirmed_via_sweep" },
          triggered_by: triggeredBy,
        });
      }
      return;
    }

    case "mark_failed": {
      // No error_reason column on holder_rewards — failure context
      // is captured in the drift_alerts row's detail field instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("holder_rewards")
        .update({
          status: "failed",
        })
        .eq("id", row.id)
        .eq("status", "in_flight")
        .select("id");
      if (error) {
        result.errors++;
        console.error(
          "[reconciliation/sweep] holder_rewards mark_failed UPDATE failed:",
          row.id,
          error
        );
        return;
      }
      const transitioned = (data?.length ?? 0) > 0;
      if (transitioned) {
        result.failed++;
        await recordDriftAlert(supabase, {
          alert_type: "reconciliation_action",
          severity: decision.severity,
          table_name: "holder_rewards",
          row_id: row.id,
          before_status: "in_flight",
          after_status: "failed",
          tx_hash: row.claimed_tx_hash,
          detail: {
            action: "tx_not_found_via_sweep",
            failure_reason: decision.reason,
          },
          triggered_by: triggeredBy,
        });
      }
      return;
    }

    case "leave_pending_chain_pending":
    case "leave_pending_api_down": {
      result.stillPending++;
      await recordDriftAlert(supabase, {
        alert_type: "reconciliation_action",
        severity: decision.severity,
        table_name: "holder_rewards",
        row_id: row.id,
        before_status: "in_flight",
        after_status: "in_flight",
        tx_hash: row.claimed_tx_hash,
        detail: {
          action:
            decision.kind === "leave_pending_chain_pending"
              ? "tx_pending_on_chain"
              : "deso_api_unreachable",
        },
        triggered_by: triggeredBy,
      });
      return;
    }

    case "drift_critical": {
      result.driftAlerts++;
      await recordDriftAlert(supabase, {
        alert_type: "drift_detected",
        severity: "CRITICAL",
        table_name: "holder_rewards",
        row_id: row.id,
        before_status: "in_flight",
        tx_hash: row.claimed_tx_hash,
        detail: {
          verify_reason: decision.reason,
          verify_detail: decision.detail,
          amount_creator_coin_nanos: row.amount_creator_coin_nanos,
          holder_deso_public_key: row.holder_deso_public_key,
          token_slug: row.token_slug,
          action: "left_alone_human_review_required",
        },
        triggered_by: triggeredBy,
      });
      return;
    }
  }
}
