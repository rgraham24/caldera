/**
 * P3-3.8a — GET /api/positions/payouts
 *
 * Returns the authenticated user's position_payouts rows in any
 * non-deleted state. Used by the portfolio settled tab to render
 * Claim buttons per row.
 *
 * Auth: P2-1 session cookie. 401 if missing.
 * Rate limit: P2-3 with bucket prefix "payouts-balance:".
 *
 * Returns rows in all states (pending | in_flight | claimed |
 * failed | blocked_insolvent) so UI can show recent claims with
 * tx links alongside actionable items. Caller filters as needed.
 *
 * See docs/P3-3-resolution-payout-design.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  position_id: string;
  market_id: string;
  winning_shares: string | number;
  payout_amount_usd: string | number;
  claim_status: string;
  claim_tx_hash: string | null;
  claimed_at: string | null;
  claim_failed_reason: string | null;
  resolved_at: string | null;
};

type MarketRow = {
  id: string;
  slug: string;
  title: string;
};

type PositionRow = {
  id: string;
  side: string;
  market_id: string;
};

type ResponseEntry = {
  payoutId: string;
  positionId: string;
  marketId: string;
  marketSlug: string;
  marketTitle: string;
  side: string;
  winningShares: number;
  payoutAmountUsd: number;
  claimStatus: string;
  claimTxHash: string | null;
  claimedAt: string | null;
  claimFailedReason: string | null;
  resolvedAt: string | null;
};

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 2. Rate limit ──────────────────────────────────────────
  const rl = await checkRateLimit(
    `payouts-balance:${desoPublicKey}`,
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

  const supabase = createServiceClient();

  // ── 3. Resolve user UUID from public key ───────────────────
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
    // No user row → no payouts. Return empty (not an error).
    return NextResponse.json({ payouts: [] });
  }
  const userId = userQ.data.id;

  // ── 4. Fetch payouts ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payoutsQ = (await (supabase as any)
    .from("position_payouts")
    .select(
      "id, position_id, market_id, winning_shares, payout_amount_usd, claim_status, claim_tx_hash, claimed_at, claim_failed_reason, resolved_at"
    )
    .eq("user_id", userId)
    .order("resolved_at", { ascending: false })) as {
    data: PayoutRow[] | null;
    error: { message: string } | null;
  };

  if (payoutsQ.error) {
    console.error("[payouts/balance] payouts query failed:", payoutsQ.error);
    return NextResponse.json(
      { error: "Failed to fetch payouts" },
      { status: 500 }
    );
  }
  if (!payoutsQ.data || payoutsQ.data.length === 0) {
    return NextResponse.json({ payouts: [] });
  }
  const payouts = payoutsQ.data;

  // ── 5. Batch-load markets and positions for display ────────
  const marketIds = Array.from(new Set(payouts.map((p) => p.market_id)));
  const positionIds = Array.from(new Set(payouts.map((p) => p.position_id)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketsQ = (await (supabase as any)
    .from("markets")
    .select("id, slug, title")
    .in("id", marketIds)) as {
    data: MarketRow[] | null;
    error: { message: string } | null;
  };

  if (marketsQ.error) {
    console.error("[payouts/balance] markets query failed:", marketsQ.error);
    return NextResponse.json(
      { error: "Failed to fetch market metadata" },
      { status: 500 }
    );
  }
  const marketById = new Map<string, MarketRow>();
  for (const m of marketsQ.data ?? []) marketById.set(m.id, m);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positionsQ = (await (supabase as any)
    .from("positions")
    .select("id, side, market_id")
    .in("id", positionIds)) as {
    data: PositionRow[] | null;
    error: { message: string } | null;
  };

  if (positionsQ.error) {
    console.error(
      "[payouts/balance] positions query failed:",
      positionsQ.error
    );
    return NextResponse.json(
      { error: "Failed to fetch position metadata" },
      { status: 500 }
    );
  }
  const positionById = new Map<string, PositionRow>();
  for (const p of positionsQ.data ?? []) positionById.set(p.id, p);

  // ── 6. Compose response ────────────────────────────────────
  const result: ResponseEntry[] = payouts.map((p) => {
    const market = marketById.get(p.market_id);
    const position = positionById.get(p.position_id);
    return {
      payoutId: p.id,
      positionId: p.position_id,
      marketId: p.market_id,
      marketSlug: market?.slug ?? "",
      marketTitle: market?.title ?? "",
      side: position?.side ?? "",
      winningShares: Number(p.winning_shares),
      payoutAmountUsd: Number(p.payout_amount_usd),
      claimStatus: p.claim_status,
      claimTxHash: p.claim_tx_hash,
      claimedAt: p.claimed_at,
      claimFailedReason: p.claim_failed_reason,
      resolvedAt: p.resolved_at,
    };
  });

  return NextResponse.json({ payouts: result });
}
