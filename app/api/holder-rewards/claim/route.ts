/**
 * P3-4.4 — POST /api/holder-rewards/claim
 *
 * Executes a holder rewards claim for ONE token. Aggregates pending
 * rows, computes creator-coin nanos at current price, runs solvency
 * preflight, locks rows pessimistically, executes on-chain transfer,
 * marks rows claimed.
 *
 * Pull-based: holder clicks button, server responds.
 * Per-token atomicity: one claim = one transfer = one (holder,
 * token_slug) batch. Multi-token claims = multiple POSTs.
 *
 * See docs/P3-4-holder-rewards-claim-design.md for the full state
 * machine and design rationale.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { transferCreatorCoin } from "@/lib/deso/transfer";
import { checkCreatorCoinSolvency } from "@/lib/deso/solvency";
import { getCreatorCoinData } from "@/lib/deso/api";

export const dynamic = "force-dynamic";

const ClaimBody = z.object({
  tokenSlug: z.string().min(1).max(64),
});

type PendingRow = {
  id: string;
  amount_usd: string;
};

type CreatorRow = {
  slug: string;
  deso_public_key: string | null;
};

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 2. Rate limit ──────────────────────────────────────────
  const rl = await checkRateLimit(
    `rewards-claim:${desoPublicKey}`,
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

  // ── 3. Validate body ───────────────────────────────────────
  let parsed: z.infer<typeof ClaimBody>;
  try {
    const json = await req.json();
    parsed = ClaimBody.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Invalid request", reason: "bad-body" },
      { status: 400 }
    );
  }
  const { tokenSlug } = parsed;

  // ── Platform wallet sanity (hard guard) ────────────────────
  const PLATFORM_PUBLIC_KEY = process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
  const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED ?? "";
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error(
      "[rewards/claim] DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED missing"
    );
    return NextResponse.json(
      { error: "Server misconfigured", reason: "platform-wallet-unavailable" },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  // ── 4. Resolve creator pubkey for tokenSlug ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorQ = (await (supabase as any)
    .from("creators")
    .select("slug, deso_public_key")
    .eq("slug", tokenSlug)
    .maybeSingle()) as { data: CreatorRow | null; error: { message: string } | null };

  if (creatorQ.error) {
    console.error("[rewards/claim] creator lookup failed:", creatorQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "creator-lookup-failed" },
      { status: 500 }
    );
  }
  if (!creatorQ.data || !creatorQ.data.deso_public_key) {
    return NextResponse.json(
      { error: "Token not claimable", reason: "token-not-claimable" },
      { status: 404 }
    );
  }
  const creatorPublicKey = creatorQ.data.deso_public_key;

  // ── 5. Load pending rows ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingQ = (await (supabase as any)
    .from("holder_rewards")
    .select("id, amount_usd")
    .eq("holder_deso_public_key", desoPublicKey)
    .eq("token_slug", tokenSlug)
    .eq("status", "pending")) as {
    data: PendingRow[] | null;
    error: { message: string } | null;
  };

  if (pendingQ.error) {
    console.error("[rewards/claim] pending fetch failed:", pendingQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "pending-fetch-failed" },
      { status: 500 }
    );
  }
  if (!pendingQ.data || pendingQ.data.length === 0) {
    return NextResponse.json(
      { error: "No pending rewards", reason: "no-pending-rewards" },
      { status: 404 }
    );
  }
  const pendingRows = pendingQ.data;
  const rowIds = pendingRows.map((r) => r.id);

  // Sum USD owed (string → number; sufficient precision at this scale)
  const sumUsd = pendingRows.reduce(
    (acc, r) => acc + Number(r.amount_usd),
    0
  );
  if (!Number.isFinite(sumUsd) || sumUsd <= 0) {
    return NextResponse.json(
      { error: "Invalid pending amount", reason: "bad-sum" },
      { status: 500 }
    );
  }

  // ── 6. Compute price + nanos ───────────────────────────────
  // token_slug == DeSo username (e.g. "bitcoin"). Pass directly.
  let priceUsdPerCoin: number;
  try {
    const coinData = await getCreatorCoinData(tokenSlug);
    priceUsdPerCoin = coinData.priceUSD;
  } catch (e) {
    console.error("[rewards/claim] price fetch failed:", e);
    return NextResponse.json(
      { error: "Price fetch failed", reason: "price-fetch-failed" },
      { status: 503 }
    );
  }
  if (!Number.isFinite(priceUsdPerCoin) || priceUsdPerCoin <= 0) {
    return NextResponse.json(
      { error: "Invalid coin price", reason: "price-invalid" },
      { status: 503 }
    );
  }

  const totalCoinFloat = sumUsd / priceUsdPerCoin;
  const totalCoinNanos = BigInt(Math.floor(totalCoinFloat * 1e9));
  if (totalCoinNanos < BigInt(1)) {
    return NextResponse.json(
      {
        error: "Amount too small to transfer",
        reason: "amount-too-small",
        sumUsd,
        priceUsdPerCoin,
      },
      { status: 400 }
    );
  }

  // ── 7. Solvency preflight ──────────────────────────────────
  const solvency = await checkCreatorCoinSolvency(
    PLATFORM_PUBLIC_KEY,
    creatorPublicKey,
    totalCoinNanos
  );
  if (!solvency.ok) {
    if (solvency.reason === "insufficient") {
      // Mark rows blocked so admin can see + intervene
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("holder_rewards")
        .update({ status: "blocked_insolvent" })
        .in("id", rowIds);
      console.error(
        "[rewards/claim] platform insolvent — marked blocked",
        {
          creatorPublicKey,
          required: totalCoinNanos.toString(),
          available: solvency.available?.toString(),
        }
      );
      return NextResponse.json(
        {
          error: "Platform insufficient funds — admin notified",
          reason: "platform-insufficient-funds",
        },
        { status: 503 }
      );
    }
    // fetch-failed
    console.error("[rewards/claim] solvency check failed:", solvency.detail);
    return NextResponse.json(
      { error: "Server error", reason: "solvency-fetch-failed" },
      { status: 503 }
    );
  }

  // ── 8. Pessimistic lock — atomically claim the rows ────────
  // UPDATE ... WHERE id IN (...) AND status = 'pending'
  // The AND status = 'pending' guard ensures a concurrent request
  // that already transitioned these rows to in_flight will lose:
  // it will get 0 rows back and abort with 409.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockQ = (await (supabase as any)
    .from("holder_rewards")
    .update({ status: "in_flight" })
    .in("id", rowIds)
    .eq("status", "pending")
    .select("id")) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };

  if (lockQ.error) {
    console.error("[rewards/claim] lock failed:", lockQ.error);
    return NextResponse.json(
      { error: "Server error", reason: "lock-failed" },
      { status: 500 }
    );
  }
  const lockedCount = lockQ.data?.length ?? 0;
  if (lockedCount === 0 || lockedCount !== rowIds.length) {
    // Either zero rows (concurrent claim already ran) or partial
    // (concurrent claim grabbed some). Either way: bail. Don't
    // submit a transfer for rows we don't fully own.
    console.warn("[rewards/claim] concurrent claim race", {
      expected: rowIds.length,
      locked: lockedCount,
    });
    return NextResponse.json(
      { error: "Concurrent claim attempt", reason: "concurrent-claim" },
      { status: 409 }
    );
  }

  // ── 9. On-chain transfer ───────────────────────────────────
  const transferResult = await transferCreatorCoin({
    creatorPublicKey,
    recipientPublicKey: desoPublicKey,
    creatorCoinNanos: totalCoinNanos,
    platformPublicKey: PLATFORM_PUBLIC_KEY,
    platformSeed: PLATFORM_SEED,
  });

  if (!transferResult.ok) {
    // Mark rows failed so they can be retried after admin
    // intervention (or auto-recovered by Phase 4 reconciliation)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("holder_rewards")
      .update({ status: "failed" })
      .in("id", rowIds);
    console.error(
      "[rewards/claim] transfer failed — marked rows failed",
      { reason: transferResult.reason, detail: transferResult.detail }
    );
    return NextResponse.json(
      { error: "Transfer failed", reason: transferResult.reason },
      { status: 500 }
    );
  }

  const { txHashHex } = transferResult;

  // ── 10. Mark claimed ───────────────────────────────────────
  // Pro-rate amount_creator_coin_nanos across rows. Last row
  // absorbs rounding remainder so per-row sum equals
  // totalCoinNanos exactly.
  let remaining = totalCoinNanos;
  const updates: Array<{ id: string; nanos: bigint }> = [];
  for (let i = 0; i < pendingRows.length; i++) {
    const row = pendingRows[i];
    let nanos: bigint;
    if (i === pendingRows.length - 1) {
      nanos = remaining;
    } else {
      const share = (Number(row.amount_usd) / sumUsd) * Number(totalCoinNanos);
      nanos = BigInt(Math.floor(share));
      remaining -= nanos;
    }
    updates.push({ id: row.id, nanos });
  }

  const claimedAt = new Date().toISOString();

  // Supabase doesn't support per-row batch updates with different
  // values — issue in parallel.
  const updateResults = await Promise.all(
    updates.map((u) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("holder_rewards")
        .update({
          status: "claimed",
          claimed_tx_hash: txHashHex,
          claimed_at: claimedAt,
          amount_creator_coin_nanos: u.nanos.toString(),
        })
        .eq("id", u.id)
    )
  );
  const updateErrors = updateResults.filter(
    (r: { error: unknown }) => r.error
  );
  if (updateErrors.length > 0) {
    // Catastrophic: tx is on-chain but ledger update partially
    // failed. Don't unwind. Leave rows in_flight; Phase 4
    // reconciliation will sweep.
    console.error(
      "[rewards/claim] CRITICAL: tx submitted but ledger update failed",
      {
        txHashHex,
        rowIds,
        errors: updateErrors.map((e: { error: unknown }) => e.error),
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
    txHashHex,
    claimedUsd: sumUsd.toFixed(8),
    claimedNanos: totalCoinNanos.toString(),
    rowsCount: rowIds.length,
    tokenSlug,
  });
}
