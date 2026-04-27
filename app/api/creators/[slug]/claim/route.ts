/**
 * P2-5 + P3-5 + CC-4b — POST /api/creators/[slug]/claim
 *
 * Canonical creator claim route. Combined flow:
 *   - First-time claim with money → profile claim + DESO send
 *   - First-time claim without money → profile claim only
 *   - Repeat earnings withdrawal → DESO send only
 *
 * The money-path logic is in lib/creators/claim-payout.ts so that
 * /api/claim/verify (legacy tweet flow) can share the same
 * atomic+ledgered+idempotent payout pattern.
 *
 * This route is responsible for the canonical *security model*:
 *   - P2-1 cookie auth
 *   - P2-5 fresh JWT
 *   - Rate limit
 *   - State gate: verification_status === "approved" (admin)
 *   - Authorization: claim_attempted_by + deso_public_key checks
 *
 * The legacy /api/claim/verify route uses the SAME shared lib but
 * a DIFFERENT gate: claim_status === "pending_claim" (tweet-verified).
 *
 * Closes CLAIM-1, CLAIM-3, CLAIM-7.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { processCreatorClaimPayout } from "@/lib/creators/claim-payout";

export const dynamic = "force-dynamic";

const ClaimBody = z.object({
  desoJwt: z.string().min(1),
});

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

  // ── 4. State validation (canonical = admin-approved gate) ─
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
    if (
      creator.claim_attempted_by &&
      creator.claim_attempted_by !== desoPublicKey
    ) {
      return NextResponse.json(
        { error: "Not the claimer", reason: "not-claimer" },
        { status: 403 }
      );
    }
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
    if (creator.deso_public_key !== desoPublicKey) {
      return NextResponse.json(
        { error: "Not the claimer", reason: "not-claimer" },
        { status: 403 }
      );
    }
  }

  // ── 6. Delegate money path to shared lib ──────────────────
  const escrowUsd = Number(creator.unclaimed_earnings_escrow ?? "0");

  const result = await processCreatorClaimPayout(supabase, {
    creatorId: creator.id,
    slug: creator.slug,
    escrowUsd,
    isFirstTimeClaim,
    recipientDesoPublicKey: desoPublicKey,
    platformPublicKey: PLATFORM_PUBLIC_KEY,
    platformSeed: PLATFORM_SEED,
  });

  if (!result.ok) {
    const responseBody: Record<string, unknown> = {
      error: result.error,
      reason: result.reason,
    };
    if (result.detail !== undefined) responseBody.detail = result.detail;
    if (result.txHashHex !== undefined) responseBody.txHashHex = result.txHashHex;
    return NextResponse.json(responseBody, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    profileClaimed: result.profileClaimed,
    txHashHex: result.txHashHex,
    amountNanos: result.amountNanos,
    escrowUsd: result.escrowUsd,
    slug: result.slug,
  });
}
