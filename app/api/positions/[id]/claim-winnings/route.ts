/**
 * P3-3.6 — POST /api/positions/[id]/claim-winnings
 *
 * Pull-based per-position payout. User clicks "Claim $X" on portfolio
 * → server transfers DESO from platform wallet to user wallet → ledger
 * row transitions pending → claimed.
 *
 * State machine:
 *   pending → in_flight → claimed | failed
 *   pending → blocked_insolvent  (admin needs to top up wallet)
 *   failed → in_flight (retry allowed)
 *
 * Closes RESOLUTION-1 (P0) and RESOLUTION-6 (P0). See
 * docs/P3-3-resolution-payout-design.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";

export const dynamic = "force-dynamic";

const POSITION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIN_PAYOUT_NANOS = BigInt(1_000);

type PayoutRow = {
  id: string;
  position_id: string;
  user_id: string;
  market_id: string;
  payout_amount_usd: string | number;
  claim_status: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: positionId } = await params;

  // ── 1. Validate URL param ──────────────────────────────────
  if (!POSITION_ID_REGEX.test(positionId)) {
    return NextResponse.json(
      { error: "Invalid position id", reason: "bad-position-id" },
      { status: 400 }
    );
  }

  // ── 2. Auth ────────────────────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 3. Rate limit ──────────────────────────────────────────
  const rl = await checkRateLimit(`claim-winnings:${desoPublicKey}`, "trades");
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

  // ── Platform wallet sanity ─────────────────────────────────
  const PLATFORM_PUBLIC_KEY = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED ?? "";
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error(
      "[claim-winnings] DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED missing"
    );
    return NextResponse.json(
      {
        error: "Server misconfigured",
        reason: "platform-wallet-unavailable",
      },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();

  // ── 4. Resolve user UUID from public key ───────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userQ = (await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", desoPublicKey)
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (userQ.error || !userQ.data) {
    return NextResponse.json(
      { error: "User not found", reason: "user-not-found" },
      { status: 404 }
    );
  }
  const userId = userQ.data.id;

  // ── 5. Load payout row ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payoutQ = (await (supabase as any)
    .from("position_payouts")
    .select("id, position_id, user_id, market_id, payout_amount_usd, claim_status")
    .eq("position_id", positionId)
    .maybeSingle()) as {
    data: PayoutRow | null;
    error: { message: string } | null;
  };

  if (payoutQ.error) {
    console.error("[claim-winnings] payout lookup failed:", payoutQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "payout-lookup-failed" },
      { status: 500 }
    );
  }
  if (!payoutQ.data) {
    return NextResponse.json(
      { error: "No winnings to claim", reason: "no-payout" },
      { status: 404 }
    );
  }
  const payout = payoutQ.data;

  // ── 6. Ownership check ─────────────────────────────────────
  if (payout.user_id !== userId) {
    return NextResponse.json(
      { error: "Forbidden", reason: "not-owner" },
      { status: 403 }
    );
  }

  // ── 7. Status check ────────────────────────────────────────
  if (
    payout.claim_status !== "pending" &&
    payout.claim_status !== "failed"
  ) {
    return NextResponse.json(
      {
        error: `Cannot claim — status is '${payout.claim_status}'`,
        reason: "not-claimable",
        currentStatus: payout.claim_status,
      },
      { status: 409 }
    );
  }

  const payoutUsd = Number(payout.payout_amount_usd);
  if (!Number.isFinite(payoutUsd) || payoutUsd <= 0) {
    return NextResponse.json(
      { error: "Invalid payout amount", reason: "bad-amount" },
      { status: 500 }
    );
  }

  // ── 8. Compute amount_nanos at current DESO rate ───────────
  let desoUsdRate: number;
  try {
    const priceRes = await fetch(
      "https://api.deso.org/api/v0/get-exchange-rate"
    );
    if (!priceRes.ok) throw new Error("price API non-200");
    const priceData = await priceRes.json();
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;
    if (!desoUSD || desoUSD <= 0) throw new Error("invalid rate");
    desoUsdRate = desoUSD;
  } catch (e) {
    console.error(
      "[claim-winnings] price fetch failed:",
      e instanceof Error ? e.message : e
    );
    return NextResponse.json(
      { error: "Price unavailable", reason: "price-fetch-failed" },
      { status: 503 }
    );
  }

  const amountFloat = (payoutUsd / desoUsdRate) * 1e9;
  const amountNanos = BigInt(Math.floor(amountFloat));

  if (amountNanos < MIN_PAYOUT_NANOS) {
    return NextResponse.json(
      {
        error: "Amount too small to transfer",
        reason: "amount-too-small",
        payoutUsd,
        desoUsdRate,
      },
      { status: 400 }
    );
  }

  // ── 9. Solvency preflight ──────────────────────────────────
  const solvency = await checkDesoSolvency(PLATFORM_PUBLIC_KEY, amountNanos);
  if (!solvency.ok) {
    if (solvency.reason === "insufficient") {
      // Mark blocked so admin queue is visible
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("position_payouts")
        .update({ claim_status: "blocked_insolvent" })
        .eq("id", payout.id);
      console.error("[claim-winnings] platform insolvent — blocked", {
        payoutId: payout.id,
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
    console.error(
      "[claim-winnings] solvency check failed:",
      solvency.detail
    );
    return NextResponse.json(
      { error: "Server error", reason: "solvency-fetch-failed" },
      { status: 503 }
    );
  }

  // ── 10. Idempotent UPDATE: pending|failed → in_flight ──────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockQ = (await (supabase as any)
    .from("position_payouts")
    .update({ claim_status: "in_flight" })
    .eq("id", payout.id)
    .in("claim_status", ["pending", "failed"])
    .select("id")) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };

  if (lockQ.error) {
    console.error("[claim-winnings] lock failed:", lockQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "lock-failed" },
      { status: 500 }
    );
  }
  if (!lockQ.data || lockQ.data.length === 0) {
    // Race lost — concurrent request already moved to in_flight
    return NextResponse.json(
      { error: "Concurrent claim attempt", reason: "concurrent-claim" },
      { status: 409 }
    );
  }

  // ── 11. On-chain transfer ──────────────────────────────────
  const transferResult = await transferDeso({
    recipientPublicKey: desoPublicKey,
    amountNanos,
    platformPublicKey: PLATFORM_PUBLIC_KEY,
    platformSeed: PLATFORM_SEED,
  });

  if (!transferResult.ok) {
    // Mark failed so user can retry. eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("position_payouts")
      .update({
        claim_status: "failed",
        claim_failed_reason: transferResult.detail.slice(0, 500),
      })
      .eq("id", payout.id);
    console.error("[claim-winnings] transfer failed", {
      payoutId: payout.id,
      reason: transferResult.reason,
      detail: transferResult.detail,
    });
    return NextResponse.json(
      { error: "Transfer failed", reason: "transfer-failed" },
      { status: 500 }
    );
  }

  const { txHashHex } = transferResult;

  // ── 12. Mark claimed ───────────────────────────────────────
  const claimedAt = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalQ = (await (supabase as any)
    .from("position_payouts")
    .update({
      claim_status: "claimed",
      claim_tx_hash: txHashHex,
      claimed_at: claimedAt,
      payout_amount_nanos: amountNanos.toString(),
      deso_usd_rate_at_claim: desoUsdRate,
    })
    .eq("id", payout.id)) as {
    data: unknown;
    error: { message: string } | null;
  };

  if (finalQ.error) {
    // CRITICAL: tx on-chain but ledger update failed.
    // Don't unwind. Phase 4 reconciliation will sweep.
    console.error(
      "[claim-winnings] CRITICAL: tx submitted but ledger update failed",
      {
        payoutId: payout.id,
        txHashHex,
        error: finalQ.error,
      }
    );
    return NextResponse.json(
      {
        error:
          "Transfer submitted but ledger update failed — admin will reconcile",
        reason: "ledger-update-failed",
        txHashHex,
      },
      { status: 500 }
    );
  }

  // ── Success ────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    payoutId: payout.id,
    positionId,
    txHashHex,
    payoutUsd,
    payoutNanos: amountNanos.toString(),
    desoUsdRate,
  });
}
