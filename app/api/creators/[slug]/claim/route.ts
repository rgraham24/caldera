/**
 * P2-5 + P3-5.5 — POST /api/creators/[slug]/claim
 *
 * Canonical creator claim route. Combined flow:
 *   - First-time claim with money → profile claim + DESO send
 *   - First-time claim without money → profile claim only
 *   - Repeat earnings withdrawal → DESO send only
 *
 * Atomic ledger discipline:
 *   - Audit row inserted BEFORE on-chain send
 *   - Escrow zeroed ONLY after on-chain confirmed (via RPC)
 *
 * See docs/P3-5-creator-claim-design.md for the full state
 * machine.
 *
 * Closes CLAIM-1, CLAIM-3 (with P3-5.4 stub deletion), CLAIM-7.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";
import { fetchDesoUsdRate } from "@/lib/deso/rate";

export const dynamic = "force-dynamic";

const ClaimBody = z.object({
  desoJwt: z.string().min(1),
});

// Minimum claim threshold: 10,000 nanos (~$0.00005 at $5/DESO).
// Below DeSo's typical 168-nano network fee but above zero.
const MIN_CLAIMABLE_NANOS = BigInt(10_000);

type CreatorRow = {
  id: string;
  slug: string;
  deso_public_key: string | null;
  tier: string | null;
  claim_status: string | null;
  verification_status: string | null;
  claim_attempted_by: string | null;
  unclaimed_earnings_escrow: string | null;
  claimed_at: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // ── 1. Auth (P2-1 cookie) ─────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 1b. Auth (P2-5 fresh-JWT) ─────────────────────────────
  let body: z.infer<typeof ClaimBody>;
  try {
    const json = await req.json();
    body = ClaimBody.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Invalid request", reason: "bad-body" },
      { status: 400 }
    );
  }

  const jwtResult = await verifyFreshDesoJwt(body.desoJwt, desoPublicKey);
  if (!jwtResult.ok) {
    return NextResponse.json(
      { error: "Invalid or stale JWT", reason: jwtResult.reason },
      { status: 401 }
    );
  }

  // ── 2. Rate limit ─────────────────────────────────────────
  const rl = await checkRateLimit(
    `creator-claim:${desoPublicKey}`,
    "trades"
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  }

  // Platform wallet env (read inside handler — P3-4 lesson)
  const PLATFORM_PUBLIC_KEY = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED ?? "";
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error(
      "[creators/claim] DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED missing"
    );
    return NextResponse.json(
      { error: "Server misconfigured", reason: "platform-wallet-unavailable" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();

  // ── 3. Load creator row ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorQ = (await (supabase as any)
    .from("creators")
    .select(
      "id, slug, deso_public_key, tier, claim_status, verification_status, claim_attempted_by, unclaimed_earnings_escrow, claimed_at"
    )
    .eq("slug", slug)
    .maybeSingle()) as { data: CreatorRow | null; error: { message: string } | null };

  if (creatorQ.error) {
    console.error("[creators/claim] creator lookup failed:", creatorQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "creator-lookup-failed" },
      { status: 500 }
    );
  }
  if (!creatorQ.data) {
    return NextResponse.json(
      { error: "Creator not found", reason: "not-found" },
      { status: 404 }
    );
  }
  const creator = creatorQ.data;

  // ── 4. State validation ───────────────────────────────────
  if (creator.verification_status !== "approved") {
    return NextResponse.json(
      {
        error: "Profile not yet verified for claim",
        reason: "profile-not-verified",
      },
      { status: 400 }
    );
  }

  const isFirstTimeClaim = creator.tier === "unclaimed";
  const isAlreadyClaimed = creator.claim_status === "claimed";

  if (!isFirstTimeClaim && !isAlreadyClaimed) {
    return NextResponse.json(
      { error: "Profile in invalid state", reason: "invalid-state" },
      { status: 400 }
    );
  }

  // ── 5. Authorization ──────────────────────────────────────
  if (isFirstTimeClaim) {
    // claim_attempted_by may be set by verify-claim — if so, must match
    if (
      creator.claim_attempted_by &&
      creator.claim_attempted_by !== desoPublicKey
    ) {
      return NextResponse.json(
        { error: "Not the claimer", reason: "not-claimer" },
        { status: 403 }
      );
    }
    // creator.deso_public_key, if set during verify-claim, must match
    if (
      creator.deso_public_key &&
      creator.deso_public_key !== desoPublicKey
    ) {
      return NextResponse.json(
        { error: "Not the claimer", reason: "not-claimer" },
        { status: 403 }
      );
    }
  } else {
    // Repeat path: deso_public_key must match
    if (creator.deso_public_key !== desoPublicKey) {
      return NextResponse.json(
        { error: "Not the claimer", reason: "not-claimer" },
        { status: 403 }
      );
    }
  }

  // ── 6. Determine action mode ──────────────────────────────
  const escrowUsdStr = creator.unclaimed_earnings_escrow ?? "0";
  const escrowUsd = Number(escrowUsdStr);
  const hasEscrow = Number.isFinite(escrowUsd) && escrowUsd > 0;

  // Repeat path with no escrow → nothing to do
  if (!isFirstTimeClaim && !hasEscrow) {
    return NextResponse.json(
      { error: "No balance to claim", reason: "no-balance" },
      { status: 400 }
    );
  }

  // ─── PATH A: Profile-only claim (no money path) ───────────
  if (!hasEscrow) {
    // First-time claim with zero escrow. Just flip profile state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateRes = (await (supabase as any)
      .from("creators")
      .update({
        tier: "verified_creator",
        claim_status: "claimed",
        deso_public_key: desoPublicKey,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", creator.id)
      .eq("tier", "unclaimed")
      .select("id")) as { data: { id: string }[] | null; error: { message: string } | null };

    if (updateRes.error) {
      console.error("[creators/claim] PATH A update failed:", updateRes.error);
      return NextResponse.json(
        { error: "Server error", reason: "profile-update-failed" },
        { status: 500 }
      );
    }
    if (!updateRes.data || updateRes.data.length === 0) {
      // Concurrent transition: someone else already claimed it
      return NextResponse.json(
        {
          error: "Concurrent claim or state changed",
          reason: "concurrent-claim-or-state-changed",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      profileClaimed: true,
      txHashHex: null,
      amountNanos: "0",
      escrowUsd: "0",
      slug: creator.slug,
    });
  }

  // ─── PATH B: Money path (hasEscrow = true) ────────────────

  // ── 7. Idempotency check ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeQ = (await (supabase as any)
    .from("creator_claim_payouts")
    .select("id")
    .eq("creator_id", creator.id)
    .in("status", ["pending", "in_flight"])
    .limit(1)) as { data: { id: string }[] | null; error: { message: string } | null };

  if (activeQ.error) {
    console.error("[creators/claim] idempotency lookup failed:", activeQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "idempotency-lookup-failed" },
      { status: 500 }
    );
  }
  if (activeQ.data && activeQ.data.length > 0) {
    return NextResponse.json(
      { error: "Claim in progress", reason: "claim-in-progress" },
      { status: 409 }
    );
  }

  // ── 8. Compute payout nanos ───────────────────────────────
  const desoUsdRate = await fetchDesoUsdRate();
  if (desoUsdRate === null || desoUsdRate <= 0) {
    return NextResponse.json(
      { error: "Price fetch failed", reason: "price-fetch-failed" },
      { status: 503 }
    );
  }
  const amountFloat = (escrowUsd / desoUsdRate) * 1e9;
  const amountNanos = BigInt(Math.floor(amountFloat));

  if (amountNanos < MIN_CLAIMABLE_NANOS) {
    return NextResponse.json(
      {
        error: "Amount too small to claim",
        reason: "amount-too-small",
        escrowUsd,
        desoUsdRate,
      },
      { status: 400 }
    );
  }

  // ── 9. Solvency preflight ─────────────────────────────────
  const solvency = await checkDesoSolvency(PLATFORM_PUBLIC_KEY, amountNanos);
  if (!solvency.ok) {
    if (solvency.reason === "insufficient") {
      console.error("[creators/claim] platform insolvent", {
        creator_id: creator.id,
        required: amountNanos.toString(),
        available: solvency.available?.toString(),
      });
      return NextResponse.json(
        {
          error: "Platform insufficient funds — admin notified",
          reason: "platform-insufficient-funds",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Solvency check failed", reason: "solvency-fetch-failed" },
      { status: 503 }
    );
  }

  // ── 10. Insert audit row (status: in_flight) ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditQ = (await (supabase as any)
    .from("creator_claim_payouts")
    .insert({
      creator_id: creator.id,
      slug: creator.slug,
      recipient_deso_public_key: desoPublicKey,
      escrow_amount_at_claim_usd: escrowUsd,
      amount_nanos: amountNanos.toString(),
      deso_usd_rate_at_claim: desoUsdRate,
      status: "in_flight",
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string; code?: string } | null };

  if (auditQ.error) {
    // Unique violation = concurrent claim race won by other request
    if (auditQ.error.code === "23505") {
      return NextResponse.json(
        { error: "Claim in progress", reason: "claim-in-progress" },
        { status: 409 }
      );
    }
    console.error("[creators/claim] audit insert failed:", auditQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "audit-row-insert-failed" },
      { status: 500 }
    );
  }
  if (!auditQ.data) {
    return NextResponse.json(
      { error: "Server error", reason: "audit-row-insert-failed" },
      { status: 500 }
    );
  }
  const auditId = auditQ.data.id;

  // ── 11. On-chain DESO transfer (P3-5.3) ───────────────────
  const transferResult = await transferDeso({
    recipientPublicKey: desoPublicKey,
    amountNanos,
    platformPublicKey: PLATFORM_PUBLIC_KEY,
    platformSeed: PLATFORM_SEED,
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
    console.error("[creators/claim] transfer failed", {
      auditId,
      reason: transferResult.reason,
      detail: transferResult.detail,
    });
    return NextResponse.json(
      { error: "Transfer failed", reason: transferResult.reason },
      { status: 500 }
    );
  }

  const { txHashHex } = transferResult;

  // ── 12. Atomic ledger transition via RPC ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcRes = await (supabase as any).rpc("mark_creator_claim_complete", {
    p_audit_id: auditId,
    p_creator_id: creator.id,
    p_escrow_usd: escrowUsd,
    p_tx_hash: txHashHex,
    p_also_claim_profile: isFirstTimeClaim,
    p_recipient_pubkey: desoPublicKey,
  });

  if (rpcRes.error) {
    // CRITICAL: tx is on-chain but ledger update failed.
    // Don't unwind — the chain is the source of truth.
    // Phase 4 reconciliation will sweep stuck in_flight rows.
    console.error("[creators/claim] CRITICAL: RPC failed after on-chain send", {
      auditId,
      txHashHex,
      creatorId: creator.id,
      error: rpcRes.error,
    });
    return NextResponse.json(
      {
        error: "Sent on-chain but ledger update failed — admin will reconcile",
        reason: "ledger-update-failed",
        txHashHex,
      },
      { status: 500 }
    );
  }

  // ── Success ───────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    profileClaimed: isFirstTimeClaim,
    txHashHex,
    amountNanos: amountNanos.toString(),
    escrowUsd: escrowUsd.toFixed(8),
    slug: creator.slug,
  });
}
