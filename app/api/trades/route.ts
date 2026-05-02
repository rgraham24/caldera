import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTradeQuote } from "@/lib/trading/amm";
import { calculateFees, type CreatorInfo } from "@/lib/fees/calculator";
import {
  executeTokenBuyback,
  transferBoughtCoinsToCreator,
} from "@/lib/deso/buyback";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyDesoTransfer } from "@/lib/deso/verifyTx";
import { fetchDesoUsdRate, usdToDesoNanos } from "@/lib/deso/rate";

const tradeSchema = z.object({
  marketId: z.string().min(1),
  side: z.enum(["yes", "no"]),
  // BUY-6 (P3-1.3): upper bound prevents outsized single-trade slippage and
  // cost-amplification on the on-chain verification path.
  amount: z.number().positive().max(10_000),
  txnHash: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid DeSo tx hash format"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = tradeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { marketId, side, amount, txnHash } = parsed.data;

    const authed = getAuthenticatedUser(req);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const desoPublicKey = authed.publicKey;

    // ── P2-3.3: per-user rate limit ──────────────────────────────
    const rl = await checkRateLimit(`trades:${desoPublicKey}`, "trades");
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

    // ── P2-2.4: verify the DeSo tx on-chain ───────────────────────
    const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY;
    if (!platformPublicKey) {
      console.error("[trades] DESO_PLATFORM_PUBLIC_KEY env var missing");
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 }
      );
    }

    const usdPerDeso = await fetchDesoUsdRate();
    if (!usdPerDeso || usdPerDeso <= 0) {
      console.error("[trades] Could not fetch DeSo rate for verification");
      return NextResponse.json(
        { error: "Rate unavailable; please retry" },
        { status: 503 }
      );
    }

    const expectedNanosExact = usdToDesoNanos(amount, usdPerDeso);
    if (expectedNanosExact === null) {
      return NextResponse.json(
        { error: "Invalid amount for nanos conversion" },
        { status: 400 }
      );
    }
    const expectedNanosTolerant = Math.floor(
      Number(expectedNanosExact) * 0.98
    );

    const verification = await verifyDesoTransfer(
      txnHash,
      desoPublicKey,
      platformPublicKey,
      expectedNanosTolerant
    );
    if (!verification.ok) {
      console.warn("[trades] tx verification failed", {
        reason: verification.reason,
        txnHash,
        desoPublicKey,
        marketId,
        amount,
        expectedNanosTolerant,
      });
      return NextResponse.json(
        { error: "Transaction verification failed", reason: verification.reason },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Look up user by DeSo public key, create if not found
    let dbUser: { id: string } | null = null;
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("deso_public_key", desoPublicKey)
      .single();

    if (existingUser) {
      dbUser = existingUser;
    } else {
      const { data: newUser } = await supabase
        .from("users")
        .insert({ deso_public_key: desoPublicKey, username: desoPublicKey.substring(0, 8) })
        .select("id")
        .single();
      dbUser = newUser;
    }

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: market } = await supabase
      .from("markets")
      .select("*")
      .eq("id", marketId)
      .single();

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    if (market.status !== "open") {
      return NextResponse.json(
        { error: "Market is not open for trading" },
        { status: 400 }
      );
    }

    // ── v2 tokenomics (LOCKED 2026-05-01) ──────────────────────────
    // Every market is creator-attached. Stale crypto-era markets without
    // a creator_slug are no longer tradable; they will be canceled by an
    // admin operation post-Phase-B.

    if (!market.creator_slug) {
      return NextResponse.json(
        { error: "Market has no creator; not tradable under v2 tokenomics" },
        { status: 400 }
      );
    }

    const { data: creatorRow } = await supabase
      .from("creators")
      .select("id, claim_status, deso_public_key, deso_username, claimed_deso_key")
      .eq("slug", market.creator_slug)
      .maybeSingle();

    if (!creatorRow) {
      return NextResponse.json(
        { error: `Creator '${market.creator_slug}' not found` },
        { status: 400 }
      );
    }

    const claimStatus: 'unclaimed' | 'pending_claim' | 'claimed' =
      creatorRow.claim_status === 'claimed'
        ? 'claimed'
        : creatorRow.claim_status === 'pending_claim'
          ? 'pending_claim'
          : 'unclaimed';

    const creator: CreatorInfo = {
      id: creatorRow.id,
      deso_public_key: creatorRow.deso_public_key,
      deso_username: creatorRow.deso_username,
      claim_status: claimStatus,
      claimed_deso_key: creatorRow.claimed_deso_key,
    };

    const fees = calculateFees(amount, creator, "buy");
    const netAmount = amount - fees.total;

    // Calculate trade quote with net amount (after fees)
    const quote = getTradeQuote(
      { yesPool: market.yes_pool ?? 0, noPool: market.no_pool ?? 0 },
      side,
      netAmount
    );

    // Pre-generate IDs so the auto-buy row id is known before the RPC call
    const tradeId = crypto.randomUUID();
    const platformFeeId = crypto.randomUUID();
    const creatorAutoBuyFeeId = crypto.randomUUID();

    const tradeRow = {
      id: tradeId,
      user_id: dbUser.id,
      market_id: marketId,
      side,
      action_type: 'buy',
      quantity: quote.sharesReceived,
      price: quote.avgFillPrice,
      gross_amount: amount,
      fee_amount: fees.total,
      platform_fee_amount: fees.platform,
      // Under v2 the creator's compensation is the auto-bought coin, not a
      // direct USD slice. We surface the auto-buy USD here so existing
      // analytics (e.g. positions-table fees_paid sum) stays meaningful.
      creator_fee_amount: fees.creatorAutoBuy,
      market_creator_fee_amount: 0,
      tx_hash: txnHash,
    };

    const marketUpdate = {
      id: marketId,
      yes_pool: quote.newYesPool,
      no_pool: quote.newNoPool,
      yes_price: quote.newYesPrice,
      no_price: quote.newNoPrice,
      volume_delta: amount,
    };

    const positionDelta = {
      user_id: dbUser.id,
      market_id: marketId,
      side,
      qty_delta: quote.sharesReceived,
      cost_delta: netAmount,
      fees_delta: fees.total,
    };

    // ── Build fee_earnings rows ─────────────────────────────────────
    // v2: exactly two recipient_types. The PB-2 CHECK constraint enforces
    // this at the DB level — any other value rolls back the trade.

    const feeRows: object[] = [];

    if (fees.platform > 0) {
      feeRows.push({
        id: platformFeeId,
        recipient_type: 'platform',
        source_type: 'trade',
        source_id: tradeId,
        amount: fees.platform,
        currency: 'USD',
      });
    }

    if (fees.creatorAutoBuy > 0) {
      feeRows.push({
        id: creatorAutoBuyFeeId,
        recipient_type: 'creator_auto_buy',
        recipient_id: creator.id,
        source_type: 'trade',
        source_id: tradeId,
        amount: fees.creatorAutoBuy,
        currency: 'USD',
      });
    }

    // ── PB-1: atomic RPC ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc('atomic_record_trade_v2', {
      p_trade: tradeRow,
      p_market: marketUpdate,
      p_position_delta: positionDelta,
      p_fees: feeRows,
    });

    if (rpcError) {
      console.error('[trades] atomic_record_trade_v2 RPC failed:', rpcError);
      if (rpcError.code === '23505') {
        return NextResponse.json(
          { error: 'Duplicate transaction', reason: 'replay' },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes('market-not-found')) {
        return NextResponse.json(
          { error: 'Market not found', reason: rpcError.message },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to record trade', reason: rpcError.message },
        { status: 500 }
      );
    }

    // ── Fire-and-forget side effects (only after RPC commits) ───────

    // buyback_events analytics — kept for the creator-profile activity feed.
    // Under v2 the personal slice equals the auto-buy slice; team/league
    // slugs are always null since the multi-tier model is gone.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('buyback_events').insert({
      market_id: market.id,
      market_title: market.title,
      creator_slug: market.creator_slug,
      team_slug: null,
      league_slug: null,
      trade_amount_usd: amount,
      personal_buyback_usd: fees.creatorAutoBuy,
      team_buyback_usd: 0,
      league_buyback_usd: 0,
      platform_fee_usd: fees.platform,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[trades] buyback_events insert failed:', error.message);
    });

    // market_price_history (analytics)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('market_price_history').insert({
      market_id: marketId,
      yes_price: quote.newYesPrice,
      no_price: quote.newNoPrice,
      total_volume: (market.total_volume ?? 0) + amount,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[trades] market_price_history insert failed:', error.message);
    });

    // ── Creator-coin auto-buy + (if claimed) post-buyback transfer ──
    // The buyback runs fire-and-forget and writes status to fee_earnings.
    // On success AND if the recipient is the creator's wallet (claimed
    // creator), chain a transfer of the bought coins to creator.claimed_deso_key
    // and update the same fee_earnings row's coin_transfer_* columns.
    // For unclaimed creators, no transfer attempt is made; coins remain
    // in the platform wallet as a claim bounty (coin_transfer_status NULL).

    if (
      fees.creatorAutoBuy > 0 &&
      process.env.DESO_PLATFORM_SEED &&
      creator.deso_public_key
    ) {
      const platformSeed = process.env.DESO_PLATFORM_SEED;
      const creatorCoinKey = creator.deso_public_key;
      const claimedKey = creator.claimed_deso_key;
      const isClaimed = fees.autoBuyRecipient === 'creator_wallet';

      void executeTokenBuyback({
        desoPublicKey: creatorCoinKey,
        amountUsd: fees.creatorAutoBuy,
        feeEarningsRowId: creatorAutoBuyFeeId,
        platformPublicKey,
        platformSeed,
        supabase: createServiceClient(),
      }).then(async (result) => {
        if (!result.ok) return;
        if (!isClaimed) return;
        if (!claimedKey) return;

        await transferBoughtCoinsToCreator({
          feeEarningsRowId: creatorAutoBuyFeeId,
          ccNanosReceived: result.ccNanosReceived,
          creatorPublicKey: creatorCoinKey,
          recipientPublicKey: claimedKey,
          platformPublicKey,
          platformSeed,
          supabase: createServiceClient(),
        });
      }).catch((err) => {
        console.error('[trades] post-buyback chain unexpected error:', err);
      });
    } else if (fees.creatorAutoBuy > 0) {
      console.warn(
        `[trades] Skipping executeTokenBuyback for row ${creatorAutoBuyFeeId}: ` +
        `DESO_PLATFORM_SEED missing or creator has no deso_public_key.`
      );
    }

    return NextResponse.json({
      data: {
        trade: { id: tradeId },
        quote: {
          sharesReceived: quote.sharesReceived,
          avgFillPrice: quote.avgFillPrice,
          newYesPrice: quote.newYesPrice,
          newNoPrice: quote.newNoPrice,
        },
        fees,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
