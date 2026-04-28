import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTradeQuote } from "@/lib/trading/amm";
import { calculateFees, getMarketFeeType, calculateBuyFees } from "@/lib/fees/calculator";
import { resolveRelevantToken } from "@/lib/fees/relevantToken";
import { snapshotHolders } from "@/lib/fees/holderSnapshot";
import { executeTokenBuyback } from "@/lib/deso/buyback";
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
  // desoPublicKey removed (P2-2.4) — identity comes from session cookie
  // via getAuthenticatedUser. Body-supplied publicKey is no longer accepted.
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

    // P2-1.5: Identity comes from the middleware-verified session cookie,
    // NOT from the request body. Any desoPublicKey in the body is ignored;
    // the Zod schema still accepts it (.optional()) during the P2-1.6
    // client transition.
    const authed = getAuthenticatedUser(req);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const desoPublicKey = authed.publicKey;

    // ── P2-3.3: per-user rate limit ──────────────────────────────
    // Prevents cost-amplification DoS (spamming triggers verifyTx +
    // DeSo rate fetch + DB writes). Fails open on Upstash errors.
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
    // ── end P2-3.3 ───────────────────────────────────────────────

    // ── P2-2.4: verify the DeSo tx on-chain ───────────────────────
    // Closes BUY-2 (fake txHash → free positions) and BUY-3
    // (replay protection at app layer). DB UNIQUE on tx_hash is
    // the defense-in-depth floor.
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
    // 2% tolerance absorbs rate drift between client-side rate
    // lookup (at trade-signing time) and server-side rate lookup
    // (now). If on-chain amount >= 98% of expected, accept.
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
    // ── end P2-2.4 verify block ───────────────────────────────────

    // P3-1.3: service-role client for all DB access in this route.
    // Defensive RLS future-proofing; aligns with P3-4/P3-5 patterns.
    // trades-side tables currently have RLS disabled, so no behaviour change.
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

    // Get market
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

    // Get fee config
    const { data: configRows } = await supabase
      .from("platform_config")
      .select("*");

    const feeConfig: Record<string, string> = {};
    configRows?.forEach((row) => {
      feeConfig[row.key] = row.value;
    });

    // Legacy fee calc — provides the per-column fee amounts for the trades row
    // and the net/total used in positionDelta. v2Fees below handles the
    // fee_earnings slice distribution.
    const feeType = getMarketFeeType(market);
    const fees = calculateFees(amount, feeType, feeConfig);

    // ── v2 tokenomics (LOCKED 2026-04-21) ──────────────────────────
    // Resolve the relevant token for this market (crypto coin / category
    // token / creator-coin). Used for holder-rewards + auto-buy routing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mktFields = market as any;
    const relevantToken = await resolveRelevantToken(
      {
        category: market.category ?? '',
        crypto_ticker: mktFields.crypto_ticker ?? null,
        creator_slug: market.creator_slug ?? null,
        category_token_slug: mktFields.category_token_slug ?? null,
      },
      supabase
    );

    // Look up the creator for claim-status + creator-slice routing.
    // Crypto markets use creator_slug for token routing only (e.g. 'bitcoin' for BTC
    // markets), not to identify a human creator. Skip the lookup so calculateBuyFees
    // receives creator=null and correctly routes to holder_rewards_topup.
    let creatorForFees = null;
    if (market.creator_slug && !mktFields.crypto_ticker) {
      const { data: creatorRow } = await supabase
        .from('creators')
        .select('id, token_status, claim_status, deso_public_key, deso_username')
        .eq('slug', market.creator_slug)
        .maybeSingle();
      if (creatorRow) {
        creatorForFees = {
          id: creatorRow.id,
          deso_public_key: creatorRow.deso_public_key,
          deso_username: creatorRow.deso_username,
          token_status: creatorRow.token_status ?? undefined,
          claim_status: creatorRow.claim_status ?? undefined,
          claimed_deso_key: creatorRow.deso_public_key,
        };
      }
    }

    const v2Fees = calculateBuyFees(amount, creatorForFees, relevantToken);

    // Calculate trade quote with net amount (after fees)
    const quote = getTradeQuote(
      { yesPool: market.yes_pool ?? 0, noPool: market.no_pool ?? 0 },
      side,
      fees.netAmount
    );

    // ── P3-1.3: atomic RPC ───────────────────────────────────────────
    // All synchronous DB writes (trade INSERT, market UPDATE, position
    // upsert, fee_earnings × N, escrow increment) go into one call.
    // Either all commit or all roll back (BUY-4 fix).
    //
    // Pre-generate IDs so autoBuyFeeId is known before the RPC call —
    // eliminates the post-RPC SELECT that was needed to get the row ID
    // for executeTokenBuyback.

    const tradeId = crypto.randomUUID();
    const autoBuyFeeId = (v2Fees.autoBuy > 0 && relevantToken?.deso_public_key)
      ? crypto.randomUUID()
      : null;

    const tradeRow = {
      id: tradeId,
      user_id: dbUser.id,
      market_id: marketId,
      side,
      action_type: 'buy',
      quantity: quote.sharesReceived,
      price: quote.avgFillPrice,
      gross_amount: amount,
      fee_amount: fees.totalFee,
      platform_fee_amount: fees.platformFee,
      creator_fee_amount: fees.creatorFee,
      market_creator_fee_amount: fees.marketCreatorFee,
      // coin_holder_pool_amount intentionally omitted (P3-1.3 dead-path cleanup).
      // Legacy v1 fee field. New rows write NULL. Column drop is a separate
      // hygiene migration.
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
      cost_delta: fees.netAmount,
      fees_delta: fees.totalFee,
    };

    // Build fee_earnings rows to insert atomically.
    // source_id references the pre-generated tradeId so the RPC can insert
    // them in the same transaction without a round-trip.
    const feeRows: object[] = [];

    // 1. Platform (always)
    if (v2Fees.platform > 0) {
      feeRows.push({
        id: crypto.randomUUID(),
        recipient_type: 'platform',
        source_type: 'trade',
        source_id: tradeId,
        amount: v2Fees.platform,
        currency: 'USD',
      });
    }

    // 2. Holder rewards pool — skip if no relevantToken deso_public_key.
    //    Dropped per 2026-04-21 decision: "no holders → log warning, platform keeps."
    if (v2Fees.holderRewards > 0 && relevantToken?.deso_public_key) {
      feeRows.push({
        id: crypto.randomUUID(),
        recipient_type: 'holder_rewards_pool',
        source_type: 'trade',
        source_id: tradeId,
        amount: v2Fees.holderRewards,
        currency: 'USD',
      });
    } else if (v2Fees.holderRewards > 0) {
      console.warn(
        `[trades] Dropping $${v2Fees.holderRewards.toFixed(4)} holder rewards ` +
        `for trade ${tradeId}: relevantToken has no deso_public_key ` +
        `(slug=${relevantToken?.slug ?? 'null'}).`
      );
    }

    // 3. Auto-buy pool — pre-generated ID so executeTokenBuyback can reference
    //    the row without a SELECT after the RPC.
    if (autoBuyFeeId) {
      feeRows.push({
        id: autoBuyFeeId,
        recipient_type: 'auto_buy_pool',
        source_type: 'trade',
        source_id: tradeId,
        amount: v2Fees.autoBuy,
        currency: 'USD',
      });
    } else if (v2Fees.autoBuy > 0) {
      console.warn(
        `[trades] Dropping $${v2Fees.autoBuy.toFixed(4)} auto-buy for trade ` +
        `${tradeId}: relevantToken has no deso_public_key.`
      );
    }

    // 4a. Creator slice → direct wallet (claimed creator)
    if (
      v2Fees.creatorSlice > 0 &&
      v2Fees.creatorSliceDestination === 'creator_wallet' &&
      v2Fees.creatorSlicePublicKey
    ) {
      feeRows.push({
        id: crypto.randomUUID(),
        recipient_type: 'creator',
        recipient_id: creatorForFees?.id ?? null,
        source_type: 'trade',
        source_id: tradeId,
        amount: v2Fees.creatorSlice,
        currency: 'USD',
      });
    }

    // 4b. Creator slice → escrow (unclaimed creator).
    //     fee_earnings row provides the audit trail; escrow increment
    //     goes through the RPC's p_escrow_* params (which call
    //     increment_unclaimed_escrow inside the same transaction).
    if (
      v2Fees.creatorSlice > 0 &&
      v2Fees.creatorSliceDestination === 'escrow' &&
      v2Fees.creatorId
    ) {
      feeRows.push({
        id: crypto.randomUUID(),
        recipient_type: 'creator_escrow',
        recipient_id: v2Fees.creatorId,
        source_type: 'trade',
        source_id: tradeId,
        amount: v2Fees.creatorSlice,
        currency: 'USD',
      });
    }

    const escrowCreatorId = (
      v2Fees.creatorSlice > 0 &&
      v2Fees.creatorSliceDestination === 'escrow' &&
      v2Fees.creatorId
    ) ? v2Fees.creatorId : null;
    const escrowAmount = escrowCreatorId ? v2Fees.creatorSlice : null;

    // Single atomic DB call — closes BUY-4.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc('atomic_record_trade', {
      p_trade: tradeRow,
      p_market: marketUpdate,
      p_position_delta: positionDelta,
      p_fees: feeRows,
      p_escrow_creator_id: escrowCreatorId,
      p_escrow_amount: escrowAmount,
    });

    if (rpcError) {
      console.error('[trades] atomic_record_trade RPC failed:', rpcError);
      // 23505 = unique_violation on trades.tx_hash — defense-in-depth replay catch
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
    // ── end P3-1.3 atomic RPC ────────────────────────────────────────

    // Fire-and-forget calls — only run after the RPC commits. If the RPC
    // fails (any error path above), these never execute, which is correct:
    // no trade row exists to reference.

    // buyback_events (analytics — no FK to trades)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('buyback_events').insert({
      market_id: market.id,
      market_title: market.title,
      creator_slug: mktFields.creator_slug ?? null,
      team_slug: mktFields.team_creator_slug ?? null,
      league_slug: mktFields.league_creator_slug ?? null,
      trade_amount_usd: amount,
      personal_buyback_usd: fees.personalToken,
      team_buyback_usd: fees.teamToken,
      league_buyback_usd: fees.leagueToken,
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

    // DeSo creator-coin buyback — uses pre-generated autoBuyFeeId so no
    // SELECT is needed after the RPC.
    if (autoBuyFeeId && process.env.DESO_PLATFORM_SEED && process.env.DESO_PLATFORM_PUBLIC_KEY) {
      void executeTokenBuyback({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        desoPublicKey: relevantToken!.deso_public_key!,
        amountUsd: v2Fees.autoBuy,
        feeEarningsRowId: autoBuyFeeId,
        platformPublicKey: process.env.DESO_PLATFORM_PUBLIC_KEY,
        platformSeed: process.env.DESO_PLATFORM_SEED,
        supabase: createServiceClient(),
      });
    } else if (autoBuyFeeId) {
      console.warn(
        `[trades] Skipping executeTokenBuyback for row ${autoBuyFeeId}: ` +
        `DESO_PLATFORM_SEED or DESO_PLATFORM_PUBLIC_KEY not set in env.`
      );
    }

    // Per-holder reward snapshot — distributes holderRewards pro-rata to
    // relevantToken holders. Has own UNIQUE index on (trade_id, holder_deso_public_key).
    if (v2Fees.holderRewards > 0 && relevantToken?.deso_public_key) {
      void snapshotHolders(
        {
          trade_id: tradeId,
          market_id: marketId,
          relevantToken,
          totalAmountUsd: v2Fees.holderRewards,
          desoUsdRate: null,
        },
        createServiceClient()
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
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
