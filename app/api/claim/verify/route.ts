/**
 * P2-5 + CC-4c — POST /api/claim/verify
 *
 * Legacy tweet-flow claim route. Used by /claim/[code] page.
 *
 * Security model: tweet-verification gate
 *   - Brave Search has confirmed the creator tweeted their code
 *     (sets claim_status === "pending_claim")
 *   - Caller proves DeSo wallet control via fresh JWT
 *
 * Money path: delegates to lib/creators/claim-payout.ts
 * (same lib used by canonical /api/creators/[slug]/claim — P3-5
 * atomic + ledgered + idempotent payout pattern). Reconciliation
 * cron from Phase 4 covers stuck rows.
 *
 * After lib success:
 *   - users row upserted (creator marked is_creator=true)
 *   - legacy claim_codes row marked claimed (legacy path only)
 *
 * Closes CLAIM-2.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { processCreatorClaimPayout } from "@/lib/creators/claim-payout";

export const dynamic = "force-dynamic";

const VerifyBody = z.object({
  code: z.string().min(1),
  desoPublicKey: z.string().min(1),
  desoUsername: z.string().optional().nullable(),
  handle: z.string().optional().nullable(),
  desoJwt: z.string().min(1),
});

type CreatorRow = {
  id: string;
  slug: string;
  name: string;
  deso_username: string | null;
  deso_public_key: string | null;
  tier: string | null;
  claim_status: string | null;
  unclaimed_earnings_escrow: string | null;
};

type ClaimCodeRow = {
  code: string;
  slug: string;
  status: string;
};

export async function POST(req: NextRequest) {
  // ── 1. Body parse + validate ──────────────────────────────
  // Pre-check auth fields before full Zod parse so existing tests
  // (and callers) get the specific 401 reasons they expect.
  let body: z.infer<typeof VerifyBody>;
  let rawJson: Record<string, unknown>;
  try {
    rawJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Missing or invalid body", reason: "bad-body" },
      { status: 400 }
    );
  }
  if (!rawJson.desoJwt) {
    return NextResponse.json(
      { error: "Missing JWT", reason: "missing-jwt" },
      { status: 401 }
    );
  }
  if (!rawJson.desoPublicKey) {
    return NextResponse.json(
      { error: "Missing public key", reason: "missing-pubkey" },
      { status: 401 }
    );
  }
  try {
    body = VerifyBody.parse(rawJson);
  } catch {
    return NextResponse.json(
      { error: "Missing or invalid body", reason: "bad-body" },
      { status: 400 }
    );
  }
  const { code, desoPublicKey, desoUsername, handle, desoJwt } = body;

  // ── 2. Fresh-JWT auth (P2-5) ──────────────────────────────
  const fresh = await verifyFreshDesoJwt(desoJwt, desoPublicKey);
  if (!fresh.ok) {
    return NextResponse.json(
      { error: "Authentication failed", reason: fresh.reason },
      { status: 401 }
    );
  }

  // ── 3. Rate limit ─────────────────────────────────────────
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

  // ── 4. Platform env sanity ────────────────────────────────
  const PLATFORM_PUBLIC_KEY = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED ?? "";
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error(
      "[claim/verify] DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED missing"
    );
    return NextResponse.json(
      { error: "Server misconfigured", reason: "platform-wallet-unavailable" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();

  // ── 5. Look up creator: new system first, then legacy ─────
  let creator: CreatorRow | null = null;
  let legacyClaim: ClaimCodeRow | null = null;

  // 5a — new system: creators.claim_code
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newSysQ = (await (supabase as any)
    .from("creators")
    .select(
      "id, name, slug, deso_username, deso_public_key, tier, claim_status, unclaimed_earnings_escrow"
    )
    .eq("claim_code", code)
    .maybeSingle()) as {
    data: CreatorRow | null;
    error: { message: string } | null;
  };

  if (newSysQ.error) {
    console.error("[claim/verify] new-system lookup failed:", newSysQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "creator-lookup-failed" },
      { status: 500 }
    );
  }

  if (newSysQ.data) {
    creator = newSysQ.data;
  } else {
    // 5b — legacy system: claim_codes table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimQ = (await (supabase as any)
      .from("claim_codes")
      .select("code, slug, status")
      .eq("code", code)
      .eq("status", "pending")
      .maybeSingle()) as {
      data: ClaimCodeRow | null;
      error: { message: string } | null;
    };

    if (claimQ.error) {
      console.error("[claim/verify] legacy claim_codes lookup failed:", claimQ.error);
      return NextResponse.json(
        { error: "Server error", reason: "claim-code-lookup-failed" },
        { status: 500 }
      );
    }
    if (!claimQ.data) {
      return NextResponse.json(
        { error: "Invalid or already claimed code", reason: "invalid-code" },
        { status: 404 }
      );
    }
    legacyClaim = claimQ.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyCreatorQ = (await (supabase as any)
      .from("creators")
      .select(
        "id, name, slug, deso_username, deso_public_key, tier, claim_status, unclaimed_earnings_escrow"
      )
      .eq("slug", legacyClaim.slug)
      .maybeSingle()) as {
      data: CreatorRow | null;
      error: { message: string } | null;
    };

    if (legacyCreatorQ.error) {
      console.error("[claim/verify] legacy creator lookup failed:", legacyCreatorQ.error);
      return NextResponse.json(
        { error: "Server error", reason: "creator-lookup-failed" },
        { status: 500 }
      );
    }
    if (!legacyCreatorQ.data) {
      return NextResponse.json(
        { error: "Creator not found", reason: "not-found" },
        { status: 404 }
      );
    }
    creator = legacyCreatorQ.data;
  }

  if (!creator) {
    // Should be unreachable but TS doesn't know
    return NextResponse.json(
      { error: "Creator not found", reason: "not-found" },
      { status: 404 }
    );
  }

  // ── 6. State validation ───────────────────────────────────
  if (creator.claim_status === "claimed") {
    return NextResponse.json(
      { error: "Already claimed", reason: "already-claimed" },
      { status: 409 }
    );
  }

  // ── 7. Tweet-verification gate ────────────────────────────
  // Tweet-verify route sets claim_status === "pending_claim" after
  // Brave Search confirms the tweet. Without that, this caller
  // hasn't proven they're the creator — reject.
  if (creator.claim_status !== "pending_claim") {
    return NextResponse.json(
      {
        error: "Tweet not yet verified. Complete tweet verification first.",
        reason: "tweet-not-verified",
      },
      { status: 400 }
    );
  }

  // ── 8. Legacy handle-match check (only legacy path) ───────
  if (legacyClaim) {
    const normalizedHandle = (handle ?? "").replace(/^@/, "").toLowerCase().trim();
    const normalizedSlug = creator.slug.toLowerCase().trim();
    const normalizedDesoUsername = (creator.deso_username ?? "")
      .toLowerCase()
      .trim();

    const handleMatches =
      !normalizedHandle ||
      normalizedHandle === normalizedSlug ||
      normalizedHandle === normalizedDesoUsername ||
      normalizedSlug.includes(normalizedHandle) ||
      normalizedHandle.includes(normalizedSlug);

    if (!handleMatches) {
      return NextResponse.json(
        {
          error: "Handle doesn't match this profile. Contact us if you think this is wrong.",
          reason: "handle-mismatch",
        },
        { status: 400 }
      );
    }
  }

  // ── 9. Delegate money path to shared lib ──────────────────
  const escrowUsd = Number(creator.unclaimed_earnings_escrow ?? "0");
  const isFirstTimeClaim = creator.tier === "unclaimed";

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

  // ── 10. Post-success bookkeeping ──────────────────────────
  // Mark legacy claim_codes row redeemed (legacy path only).
  if (legacyClaim) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: claimUpdateErr } = await (supabase as any)
      .from("claim_codes")
      .update({
        status: "claimed",
        claimed_at: new Date().toISOString(),
        claimed_by_deso_key: desoPublicKey,
      })
      .eq("code", code);
    if (claimUpdateErr) {
      console.error(
        "[claim/verify] legacy claim_codes update failed (non-fatal):",
        claimUpdateErr
      );
    }
  }

  // Upsert users row (creator marked is_creator=true).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: userUpsertErr } = await (supabase as any).from("users").upsert(
    {
      deso_public_key: desoPublicKey,
      username: desoUsername || handle || creator.slug,
      is_creator: true,
      creator_id: creator.id,
    },
    { onConflict: "deso_public_key" }
  );
  if (userUpsertErr) {
    console.error(
      "[claim/verify] users upsert failed (non-fatal):",
      userUpsertErr
    );
  }

  // ── Success ───────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    success: true,                   // legacy field — frontend reads this
    profileClaimed: result.profileClaimed,
    txHashHex: result.txHashHex,
    amountNanos: result.amountNanos,
    escrowUsd: result.escrowUsd,
    slug: result.slug,
  });
}
