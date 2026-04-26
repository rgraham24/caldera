import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";

export const dynamic = "force-dynamic";

const sellSchema = z.object({
  marketId: z.string().uuid(),
  side: z.enum(["yes", "no"]),
  shares: z.number().positive().max(1_000_000),
  idempotencyKey: z.string().uuid(),
});

const REASON_MESSAGES: Record<string, string> = {
  "bad-body": "Invalid request body.",
  "user-not-found": "User account not found.",
  "market-not-found": "Market not found.",
  "market-closed": "Market is no longer accepting trades.",
  "no-position": "No open position to sell.",
  "not-enough-shares": "Not enough shares in your position.",
  "amount-too-small": "Sell amount too small to pay out.",
  "price-fetch-failed": "Couldn't fetch current DESO price. Try again.",
  "platform-insufficient-funds":
    "Platform funds too low — admin notified. Try again later.",
  "sell-in-progress": "Another sell is already in progress for this position.",
  "transfer-failed": "On-chain payout failed.",
  "ledger-update-failed":
    "Sent on-chain but ledger update failed — admin will reconcile.",
};

const MIN_PAYOUT_NANOS = BigInt(1_000); // SELL-6 fix: match buyback floor

export async function POST(req: NextRequest) {
  // ── 1. Body validation (Zod) ─────────────────────────────
  let body: z.infer<typeof sellSchema>;
  try {
    const json = await req.json();
    body = sellSchema.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Invalid request", reason: "bad-body" },
      { status: 400 }
    );
  }

  // ── 2. Auth (P2-1 cookie) ────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 3. Rate limit (P2-3) ─────────────────────────────────
  const rl = await checkRateLimit(`sell:${desoPublicKey}`, "trades");
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

  // Platform wallet env (read inside handler — TS gotcha #2 from memory)
  const PLATFORM_PUBLIC_KEY =
    process.env.DESO_PLATFORM_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY ??
    "";
  const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED ?? "";
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error(
      "[sell] DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED missing"
    );
    return NextResponse.json(
      { error: "Server misconfigured", reason: "platform-wallet-unavailable" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();

  // ── 4. User lookup ───────────────────────────────────────
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

  // ── 5. Market lookup + status ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketQ = (await (supabase as any)
    .from("markets")
    .select("id, status, yes_price, no_price, yes_pool, no_pool, total_volume")
    .eq("id", body.marketId)
    .maybeSingle()) as {
    data: {
      id: string;
      status: string;
      yes_price: number | null;
      no_price: number | null;
      yes_pool: number | null;
      no_pool: number | null;
      total_volume: number | null;
    } | null;
    error: { message: string } | null;
  };

  if (marketQ.error || !marketQ.data) {
    return NextResponse.json(
      { error: "Market not found", reason: "market-not-found" },
      { status: 404 }
    );
  }
  const market = marketQ.data;

  if (market.status !== "open") {
    return NextResponse.json(
      { error: "Market closed", reason: "market-closed" },
      { status: 400 }
    );
  }

  // ── 6. Position lookup + ownership ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posQ = (await (supabase as any)
    .from("positions")
    .select("id, quantity, total_cost, fees_paid, avg_entry_price, realized_pnl, status")
    .eq("user_id", userId)
    .eq("market_id", body.marketId)
    .eq("side", body.side)
    .neq("status", "closed")
    .maybeSingle()) as {
    data: {
      id: string;
      quantity: number;
      total_cost: number;
      fees_paid: number;
      avg_entry_price: number | null;
      realized_pnl: number | null;
      status: string;
    } | null;
    error: { message: string } | null;
  };

  if (posQ.error || !posQ.data) {
    return NextResponse.json(
      { error: "No open position", reason: "no-position" },
      { status: 404 }
    );
  }
  const position = posQ.data;

  if (position.quantity < body.shares) {
    return NextResponse.json(
      {
        error: "Not enough shares",
        reason: "not-enough-shares",
        owned: position.quantity,
        requested: body.shares,
      },
      { status: 400 }
    );
  }

  // ── 7. Quote calculation (spot-price for now) ────────────
  // P3-2 keeps current sell semantics: spot price, no AMM pool change.
  // AMM-on-sells is a separate design decision worthy of its own commit.
  // The SETTLE RPC still updates the market row (volume bump + price
  // history snapshot) but pool/price values are unchanged.
  const sharesToSell = body.shares;
  const currentPrice =
    body.side === "yes"
      ? Number(market.yes_price ?? 0.5)
      : Number(market.no_price ?? 0.5);
  const returnAmount = sharesToSell * currentPrice;
  const avgEntry = Number(position.avg_entry_price ?? 0.5);
  const realizedPnlDelta = (currentPrice - avgEntry) * sharesToSell;
  const newQuantity = position.quantity - sharesToSell;
  const willClose = newQuantity < 0.001;
  // Cost basis to remove: pro-rata for partial, full on close.
  const totalCostDelta = willClose
    ? Number(position.total_cost ?? 0)
    : sharesToSell * avgEntry;

  // ── 8. Compute payout in nanos + solvency ────────────────
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
      "[sell] price fetch failed:",
      e instanceof Error ? e.message : e
    );
    return NextResponse.json(
      { error: "Price unavailable", reason: "price-fetch-failed" },
      { status: 503 }
    );
  }

  const amountFloat = (returnAmount / desoUsdRate) * 1e9;
  const amountNanos = BigInt(Math.floor(amountFloat));

  if (amountNanos < MIN_PAYOUT_NANOS) {
    return NextResponse.json(
      {
        error: "Amount too small",
        reason: "amount-too-small",
        returnAmount,
        desoUsdRate,
      },
      { status: 400 }
    );
  }

  // ── 9. Solvency preflight (P2-6) ─────────────────────────
  const solvency = await checkDesoSolvency(PLATFORM_PUBLIC_KEY, amountNanos);
  if (!solvency.ok) {
    if (solvency.reason === "insufficient") {
      console.error("[sell] platform insolvent", {
        userId,
        marketId: body.marketId,
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

  // ── 10. OPEN: insert trade row with payout_status='pending' ───
  // Idempotency: client-supplied UUID is the trade.id. Existing PK
  // gives us free idempotency-on-retry. Plus partial UNIQUE index
  // uq_pending_sell catches concurrent in-flight sells for same combo.
  const tradeRow = {
    id: body.idempotencyKey,
    user_id: userId,
    market_id: body.marketId,
    side: body.side,
    action_type: "sell",
    quantity: sharesToSell,
    price: currentPrice,
    gross_amount: returnAmount,
    fee_amount: 0,
    platform_fee_amount: 0,
    creator_fee_amount: 0,
    market_creator_fee_amount: 0,
    payout_status: "pending",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertRes = (await (supabase as any)
    .from("trades")
    .insert(tradeRow)
    .select("id")
    .single()) as {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };

  if (insertRes.error) {
    if (insertRes.error.code === "23505") {
      // Either trade.id collision OR partial UNIQUE on pending.
      // Both → 409 sell already in progress.
      return NextResponse.json(
        { error: "Sell in progress", reason: "sell-in-progress" },
        { status: 409 }
      );
    }
    console.error("[sell] OPEN insert failed:", insertRes.error);
    return NextResponse.json(
      { error: "Could not record trade", reason: "open-insert-failed" },
      { status: 500 }
    );
  }
  const tradeId = body.idempotencyKey;

  // ── 11. On-chain transfer ────────────────────────────────
  const transferResult = await transferDeso({
    recipientPublicKey: desoPublicKey,
    amountNanos,
    platformPublicKey: PLATFORM_PUBLIC_KEY,
    platformSeed: PLATFORM_SEED,
  });

  if (!transferResult.ok) {
    // Mark trade failed; position untouched. User can retry with
    // a fresh idempotencyKey.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("trades")
      .update({
        payout_status: "failed",
        payout_failed_reason: transferResult.detail.slice(0, 500),
      })
      .eq("id", tradeId);
    console.error("[sell] transfer failed", {
      tradeId,
      reason: transferResult.reason,
      detail: transferResult.detail,
    });
    return NextResponse.json(
      { error: "Transfer failed", reason: "transfer-failed" },
      { status: 500 }
    );
  }

  const { txHashHex } = transferResult;

  // ── 12. SETTLE: atomic ledger transition via RPC ────────
  // Pass current pool/price values (no AMM change on sells in P3-2)
  // but bump volume and snapshot price history.
  const positionDelta = {
    id: position.id,
    qty_to_remove: sharesToSell,
    realized_pnl_delta: realizedPnlDelta,
    total_cost_delta: totalCostDelta,
    close: willClose,
  };

  const marketUpdate = {
    id: market.id,
    yes_pool: Number(market.yes_pool ?? 0),
    no_pool: Number(market.no_pool ?? 0),
    yes_price: Number(market.yes_price ?? 0.5),
    no_price: Number(market.no_price ?? 0.5),
    volume_delta: returnAmount,
    history_yes_price: Number(market.yes_price ?? 0.5),
    history_no_price: Number(market.no_price ?? 0.5),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcRes = await (supabase as any).rpc("mark_sell_complete", {
    p_trade_id: tradeId,
    p_payout_tx_hash: txHashHex,
    p_position_delta: positionDelta,
    p_market_update: marketUpdate,
  });

  if (rpcRes.error) {
    // CRITICAL: tx is on-chain but ledger update failed.
    // Don't unwind — the chain is the source of truth.
    // Phase 4 reconciliation will sweep stuck trades.
    console.error("[sell] CRITICAL: RPC failed after on-chain send", {
      tradeId,
      txHashHex,
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

  // ── Success ──────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    tradeId,
    sharesSold: sharesToSell,
    returnAmount,
    realizedPnl: (position.realized_pnl ?? 0) + realizedPnlDelta,
    newQuantity: willClose ? 0 : newQuantity,
    payoutTxHashHex: txHashHex,
    amountNanos: amountNanos.toString(),
  });
}
