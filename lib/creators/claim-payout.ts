/**
 * Shared money-path lib for creator claims.
 *
 * Extracted from app/api/creators/[slug]/claim/route.ts (canonical
 * route) so that /api/claim/verify (legacy tweet-flow route) can
 * use the identical atomic + ledgered + idempotent payout pattern.
 *
 * Caller is responsible for:
 *   - Authenticating the request (session cookie + fresh JWT)
 *   - State validation (verification_status="approved" OR
 *     claim_status="pending_claim", per the route's security model)
 *   - Loading the creator row
 *
 * This lib handles:
 *   - PATH A (escrow == 0): profile-only flip via UPDATE with
 *     concurrency guard
 *   - PATH B (escrow > 0): full money flow
 *     - Idempotency check on creator_claim_payouts (pending|in_flight)
 *     - DeSo USD rate fetch + nanos compute
 *     - Solvency preflight via checkDesoSolvency
 *     - Audit row insert (status: in_flight)
 *     - On-chain transferDeso
 *     - Atomic mark_creator_claim_complete RPC
 *
 * Returns a tagged union with the same shape the routes need.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";
import { fetchDesoUsdRate } from "@/lib/deso/rate";

// Minimum claim threshold: 10,000 nanos (~$0.00005 at $5/DESO).
// Below DeSo's typical 168-nano network fee but above zero.
const MIN_CLAIMABLE_NANOS = BigInt(10_000);

export type CreatorClaimInput = {
  creatorId: string;
  slug: string;
  escrowUsd: number;
  isFirstTimeClaim: boolean;
  recipientDesoPublicKey: string;
  platformPublicKey: string;
  platformSeed: string;
};

export type CreatorClaimResult =
  | {
      ok: true;
      profileClaimed: boolean;
      txHashHex: string | null;
      amountNanos: string;
      escrowUsd: string;
      slug: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      reason: string;
      detail?: unknown;
      txHashHex?: string;
    };

export async function processCreatorClaimPayout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: CreatorClaimInput
): Promise<CreatorClaimResult> {
  const {
    creatorId,
    slug,
    escrowUsd,
    isFirstTimeClaim,
    recipientDesoPublicKey,
    platformPublicKey,
    platformSeed,
  } = params;

  const hasEscrow = Number.isFinite(escrowUsd) && escrowUsd > 0;

  // Repeat path with no escrow → nothing to do
  if (!isFirstTimeClaim && !hasEscrow) {
    return {
      ok: false,
      status: 400,
      error: "No balance to claim",
      reason: "no-balance",
    };
  }

  // ─── PATH A: Profile-only claim (no money) ──────────────────
  if (!hasEscrow) {
    // First-time claim with zero escrow. Just flip profile state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateRes = (await (supabase as any)
      .from("creators")
      .update({
        tier: "verified_creator",
        claim_status: "claimed",
        deso_public_key: recipientDesoPublicKey,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", creatorId)
      .eq("tier", "unclaimed")
      .select("id")) as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

    if (updateRes.error) {
      console.error("[claim-payout] PATH A update failed:", updateRes.error);
      return {
        ok: false,
        status: 500,
        error: "Server error",
        reason: "profile-update-failed",
      };
    }
    if (!updateRes.data || updateRes.data.length === 0) {
      // Concurrent transition: someone else already claimed it
      return {
        ok: false,
        status: 409,
        error: "Concurrent claim or state changed",
        reason: "concurrent-claim-or-state-changed",
      };
    }

    return {
      ok: true,
      profileClaimed: true,
      txHashHex: null,
      amountNanos: "0",
      escrowUsd: "0",
      slug,
    };
  }

  // ─── PATH B: Money path (hasEscrow = true) ──────────────────

  // ── Idempotency check ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeQ = (await (supabase as any)
    .from("creator_claim_payouts")
    .select("id")
    .eq("creator_id", creatorId)
    .in("status", ["pending", "in_flight"])
    .limit(1)) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };

  if (activeQ.error) {
    console.error("[claim-payout] idempotency lookup failed:", activeQ.error);
    return {
      ok: false,
      status: 500,
      error: "Server error",
      reason: "idempotency-lookup-failed",
    };
  }
  if (activeQ.data && activeQ.data.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Claim in progress",
      reason: "claim-in-progress",
    };
  }

  // ── Compute payout nanos ───────────────────────────────────
  const desoUsdRate = await fetchDesoUsdRate();
  if (desoUsdRate === null || desoUsdRate <= 0) {
    return {
      ok: false,
      status: 503,
      error: "Price fetch failed",
      reason: "price-fetch-failed",
    };
  }
  const amountFloat = (escrowUsd / desoUsdRate) * 1e9;
  const amountNanos = BigInt(Math.floor(amountFloat));

  if (amountNanos < MIN_CLAIMABLE_NANOS) {
    return {
      ok: false,
      status: 400,
      error: "Amount too small to claim",
      reason: "amount-too-small",
      detail: { escrowUsd, desoUsdRate },
    };
  }

  // ── Solvency preflight ─────────────────────────────────────
  const solvency = await checkDesoSolvency(platformPublicKey, amountNanos);
  if (!solvency.ok) {
    if (solvency.reason === "insufficient") {
      console.error("[claim-payout] platform insolvent", {
        creatorId,
        required: amountNanos.toString(),
        available: solvency.available?.toString(),
      });
      return {
        ok: false,
        status: 503,
        error: "Platform insufficient funds — admin notified",
        reason: "platform-insufficient-funds",
      };
    }
    return {
      ok: false,
      status: 503,
      error: "Solvency check failed",
      reason: "solvency-fetch-failed",
    };
  }

  // ── Insert audit row (status: in_flight) ───────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditQ = (await (supabase as any)
    .from("creator_claim_payouts")
    .insert({
      creator_id: creatorId,
      slug,
      recipient_deso_public_key: recipientDesoPublicKey,
      escrow_amount_at_claim_usd: escrowUsd,
      amount_nanos: amountNanos.toString(),
      deso_usd_rate_at_claim: desoUsdRate,
      status: "in_flight",
    })
    .select("id")
    .single()) as {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };

  if (auditQ.error) {
    // Unique violation = concurrent claim race won by other request
    if (auditQ.error.code === "23505") {
      return {
        ok: false,
        status: 409,
        error: "Claim in progress",
        reason: "claim-in-progress",
      };
    }
    console.error("[claim-payout] audit insert failed:", auditQ.error);
    return {
      ok: false,
      status: 500,
      error: "Server error",
      reason: "audit-row-insert-failed",
    };
  }
  if (!auditQ.data) {
    return {
      ok: false,
      status: 500,
      error: "Server error",
      reason: "audit-row-insert-failed",
    };
  }
  const auditId = auditQ.data.id;

  // ── On-chain DESO transfer ─────────────────────────────────
  const transferResult = await transferDeso({
    recipientPublicKey: recipientDesoPublicKey,
    amountNanos,
    platformPublicKey,
    platformSeed,
  });

  if (!transferResult.ok) {
    // Mark audit row failed; escrow untouched
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("creator_claim_payouts")
      .update({
        status: "failed",
        error_reason: transferResult.detail.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    console.error("[claim-payout] transfer failed", {
      auditId,
      reason: transferResult.reason,
      detail: transferResult.detail,
    });
    return {
      ok: false,
      status: 500,
      error: "Transfer failed",
      reason: transferResult.reason,
    };
  }

  const { txHashHex } = transferResult;

  // ── Atomic ledger transition via RPC ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcRes = await (supabase as any).rpc("mark_creator_claim_complete", {
    p_audit_id: auditId,
    p_creator_id: creatorId,
    p_escrow_usd: escrowUsd,
    p_tx_hash: txHashHex,
    p_also_claim_profile: isFirstTimeClaim,
    p_recipient_pubkey: recipientDesoPublicKey,
  });

  if (rpcRes.error) {
    // CRITICAL: tx is on-chain but ledger update failed.
    // Don't unwind — chain is source of truth.
    // Phase 4 reconciliation will sweep stuck in_flight rows.
    console.error("[claim-payout] CRITICAL: RPC failed after on-chain send", {
      auditId,
      txHashHex,
      creatorId,
      error: rpcRes.error,
    });
    return {
      ok: false,
      status: 500,
      error: "Sent on-chain but ledger update failed — admin will reconcile",
      reason: "ledger-update-failed",
      txHashHex,
    };
  }

  // ── Success ───────────────────────────────────────────────
  return {
    ok: true,
    profileClaimed: isFirstTimeClaim,
    txHashHex,
    amountNanos: amountNanos.toString(),
    escrowUsd: escrowUsd.toFixed(8),
    slug,
  };
}
