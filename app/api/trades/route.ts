import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTradeQuote } from "@/lib/trading/amm";
import { calculateFees, getMarketFeeType, calculateBuyFees } from "@/lib/fees/calculator";
import { resolveRelevantToken } from "@/lib/fees/relevantToken";
import { snapshotHolders } from "@/lib/fees/holderSnapshot";
import { executeTokenBuyback } from "@/lib/deso/buyback";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyDesoTransfer, type VerifyFailReason } from "@/lib/deso/verifyTx";
import { fetchDesoUsdRate, usdToDesoNanos } from "@/lib/deso/rate";

const tradeSchema = z.object({
  marketId: z.string().min(1),
  side: z.enum(["yes", "no"]),
  amount: z.number().positive(),
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

    const supabase = await createClient();

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

    // Calculate fees — legacy path stays for backward compat with downstream
    // (buyback_events, positions, trades row writes). New v2 values are used
    // for the fee_earnings inserts below.
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

    // Look up the creator for claim-status + creator-slice routing
    let creatorForFees = null;
    if (market.creator_slug) {
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

    // Fire-and-forget buyback event — never blocks the trade
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkt = market as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("buyback_events").insert({
      market_id: market.id,
      market_title: market.title,
      creator_slug: mkt.creator_slug ?? null,
      team_slug: mkt.team_creator_slug ?? null,
      league_slug: mkt.league_creator_slug ?? null,
      trade_amount_usd: amount,
      personal_buyback_usd: fees.personalToken,
      team_buyback_usd: fees.teamToken,
      league_buyback_usd: fees.leagueToken,
      platform_fee_usd: fees.platform,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[trades] buyback_events insert failed:', error.message);
    });

    // Calculate trade quote with net amount (after fees)
    const quote = getTradeQuote(
      { yesPool: market.yes_pool ?? 0, noPool: market.no_pool ?? 0 },
      side,
      fees.netAmount
    );

    // Update market pools and prices
    const { error: marketError } = await supabase
      .from("markets")
      .update({
        yes_pool: quote.newYesPool,
        no_pool: quote.newNoPool,
        yes_price: quote.newYesPrice,
        no_price: quote.newNoPrice,
        total_volume: (market.total_volume ?? 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", marketId);

    if (marketError) {
      return NextResponse.json(
        { error: "Failed to update market" },
        { status: 500 }
      );
    }

    // Record price history snapshot (fire-and-forget)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("market_price_history").insert({
      market_id: marketId,
      yes_price: quote.newYesPrice,
      no_price: quote.newNoPrice,
      total_volume: (market.total_volume ?? 0) + amount,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[trades] market_price_history insert failed:', error.message);
    });

    // Insert trade
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        user_id: dbUser.id,
        market_id: marketId,
        side,
        action_type: "buy",
        quantity: quote.sharesReceived,
        price: quote.avgFillPrice,
        gross_amount: amount,
        fee_amount: fees.totalFee,
        platform_fee_amount: fees.platformFee,
        creator_fee_amount: fees.creatorFee,
        market_creator_fee_amount: fees.marketCreatorFee,
        coin_holder_pool_amount: fees.coinHolderPoolFee,
        tx_hash: txnHash,
      })
      .select()
      .single();

    if (tradeError) {
      console.error("Error inserting trade:", tradeError);
      // Postgres unique_violation on trades.tx_hash (P2-2.3 constraint).
      // This is the defense-in-depth catch if verifyTx somehow allows
      // a replay. Map to HTTP 409 so client knows it's a duplicate,
      // not a server fault.
      if (tradeError.code === "23505") {
        return NextResponse.json(
          { error: "Duplicate transaction", reason: "duplicate-tx-hash" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to record trade" },
        { status: 500 }
      );
    }

    // Upsert position
    const { data: existingPosition } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", dbUser.id)
      .eq("market_id", marketId)
      .eq("side", side)
      .single();

    if (existingPosition) {
      const newQuantity = (existingPosition.quantity ?? 0) + quote.sharesReceived;
      const newTotalCost = (existingPosition.total_cost ?? 0) + fees.netAmount;
      const newAvgEntry = newTotalCost / newQuantity;

      await supabase
        .from("positions")
        .update({
          quantity: newQuantity,
          avg_entry_price: newAvgEntry,
          total_cost: newTotalCost,
          fees_paid: (existingPosition.fees_paid ?? 0) + fees.totalFee,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPosition.id);
    } else {
      await supabase.from("positions").insert({
        user_id: dbUser.id,
        market_id: marketId,
        side,
        quantity: quote.sharesReceived,
        avg_entry_price: quote.avgFillPrice,
        total_cost: fees.netAmount,
        fees_paid: fees.totalFee,
      });
    }

    // ── v2 fee_earnings inserts ──────────────────────────────────────
    // Four slices per trade, per locked tokenomics (see DECISIONS.md
    // 2026-04-21):
    //   platform            — always 1%
    //   holder_rewards_pool — 0.5% (or 1% if no-creator topup) routed
    //                          to holders of relevantToken at payout time
    //   auto_buy_pool       — 0.5% used to buy relevantToken on DeSo
    //   creator             — 0.5% to claimed creator's wallet
    //                         (unclaimed creator slice goes to escrow —
    //                         handled in commit 3b, not here)

    // 1. Platform (always)
    if (v2Fees.platform > 0) {
      const { error } = await supabase.from("fee_earnings").insert({
        recipient_type: "platform",
        source_type: "trade",
        source_id: trade.id,
        amount: v2Fees.platform,
        currency: "USD",
      });
      if (error) console.error('[trades] fee_earnings insert failed for platform:', error.message, error.details);
    }

    // 2. Holder rewards pool — skip if no relevantToken or token has no
    //    DeSo public key (ghost slug). The 0.5% is dropped per 2026-04-21
    //    decision: "no holders → platform keeps, log warning."
    if (v2Fees.holderRewards > 0 && relevantToken?.deso_public_key) {
      const { error } = await supabase.from("fee_earnings").insert({
        recipient_type: "holder_rewards_pool",
        recipient_id: null, // distributed at holder-snapshot time in commit 3c
        source_type: "trade",
        source_id: trade.id,
        amount: v2Fees.holderRewards,
        currency: "USD",
      });
      if (error) console.error('[trades] fee_earnings insert failed for holder_rewards_pool:', error.message, error.details);
    } else if (v2Fees.holderRewards > 0) {
      console.warn(
        `[trades] Dropping $${v2Fees.holderRewards.toFixed(4)} holder rewards ` +
        `for trade ${trade.id}: relevantToken has no deso_public_key ` +
        `(slug=${relevantToken?.slug ?? 'null'}).`
      );
    }

    // 3. Auto-buy pool — 0.5% that funds a real DeSo creator-coin buy
    //    of relevantToken. Insert first (for the audit trail), then fire
    //    executeTokenBuyback fire-and-forget. The buyback function
    //    updates this row's status/tx_hash when DeSo confirms, or
    //    status='failed'/failed_reason on any gate failure (see
    //    lib/deso/buyback.ts — 3d.2c).
    if (v2Fees.autoBuy > 0 && relevantToken?.deso_public_key) {
      const { data: autoBuyRow, error } = await supabase
        .from("fee_earnings")
        .insert({
          recipient_type: "auto_buy_pool",
          recipient_id: null,
          source_type: "trade",
          source_id: trade.id,
          amount: v2Fees.autoBuy,
          currency: "USD",
        })
        .select('id')
        .single();

      if (error) {
        console.error(
          '[trades] fee_earnings insert failed for auto_buy_pool:',
          error.message, error.details
        );
      } else if (autoBuyRow && process.env.DESO_PLATFORM_SEED && process.env.DESO_PLATFORM_PUBLIC_KEY) {
        // Fire-and-forget DeSo buyback. Never throws.
        // Writes status='paid'+tx_hash on success, status='failed'+reason on failure.
        void executeTokenBuyback({
          desoPublicKey: relevantToken.deso_public_key,
          amountUsd: v2Fees.autoBuy,
          feeEarningsRowId: autoBuyRow.id,
          platformPublicKey: process.env.DESO_PLATFORM_PUBLIC_KEY,
          platformSeed: process.env.DESO_PLATFORM_SEED,
          supabase: createServiceClient(),
        });
      } else if (autoBuyRow) {
        // Row written, but env is missing — mark failed so it's visible.
        console.warn(
          `[trades] Skipping executeTokenBuyback for row ${autoBuyRow.id}: ` +
          `DESO_PLATFORM_SEED or DESO_PLATFORM_PUBLIC_KEY not set in env.`
        );
      }
    } else if (v2Fees.autoBuy > 0) {
      console.warn(
        `[trades] Dropping $${v2Fees.autoBuy.toFixed(4)} auto-buy for trade ` +
        `${trade.id}: relevantToken has no deso_public_key.`
      );
    }

    // ── Per-holder reward snapshot (fire-and-forget) ─────────────────
    // Writes one holder_rewards row per holder of relevantToken with
    // their pro-rata share of v2Fees.holderRewards. Runs async;
    // failures don't block the trade response. See
    // lib/fees/holderSnapshot.ts and DECISIONS.md 2026-04-21.
    // Unique index on (trade_id, holder_deso_public_key) protects
    // against double-writes if this somehow runs twice.
    if (v2Fees.holderRewards > 0 && relevantToken?.deso_public_key) {
      void snapshotHolders(
        {
          trade_id: trade.id,
          market_id: marketId,
          relevantToken,
          totalAmountUsd: v2Fees.holderRewards,
          desoUsdRate: null,  // snapshotHolders fetches its own rate
        },
        createServiceClient()
      );
    }

    // 4. Creator slice — only paid out to wallet when claimed.
    //    Unclaimed: accrues to unclaimed_earnings_escrow (wired in commit 3b).
    if (
      v2Fees.creatorSlice > 0 &&
      v2Fees.creatorSliceDestination === "creator_wallet" &&
      v2Fees.creatorSlicePublicKey
    ) {
      const { error } = await supabase.from("fee_earnings").insert({
        recipient_type: "creator",
        recipient_id: creatorForFees?.id ?? null,
        source_type: "trade",
        source_id: trade.id,
        amount: v2Fees.creatorSlice,
        currency: "USD",
      });
      if (error) console.error('[trades] fee_earnings insert failed for creator:', error.message, error.details);
    }

    // 5. Creator escrow accrual — unclaimed creators.
    //    Writes both a fee_earnings row (for audit trail) AND increments
    //    creators.unclaimed_earnings_escrow via the atomic RPC (race-safe).
    //    Rolls over to $Caldera<Category> holder rewards after 12 months.
    //    See DECISIONS.md 2026-04-21.
    if (
      v2Fees.creatorSlice > 0 &&
      v2Fees.creatorSliceDestination === "escrow" &&
      v2Fees.creatorId
    ) {
      // Ledger row first — unified audit trail.
      const { error: feeErr } = await supabase.from("fee_earnings").insert({
        recipient_type: "creator_escrow",
        recipient_id: v2Fees.creatorId,
        source_type: "trade",
        source_id: trade.id,
        amount: v2Fees.creatorSlice,
        currency: "USD",
      });
      if (feeErr) {
        console.error(
          '[trades] fee_earnings insert failed for creator_escrow:',
          feeErr.message, feeErr.details
        );
      }

      // Atomic increment on creators.unclaimed_earnings_escrow.
      // The function sets unclaimed_escrow_first_accrued_at on first accrual only.
      // Must use the service-role client — the function is REVOKED from anon/authenticated
      // (see migration 20260422_increment_unclaimed_escrow_fn.sql).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (createServiceClient() as any).rpc('increment_unclaimed_escrow', {
        p_creator_id: v2Fees.creatorId,
        p_amount: v2Fees.creatorSlice,
      });
      if (rpcErr) {
        console.error(
          '[trades] increment_unclaimed_escrow RPC failed:',
          rpcErr.message,
          `creator_id=${v2Fees.creatorId} amount=${v2Fees.creatorSlice}`
        );
      }
    }

    // Coin holder pool distribution
    if (fees.coinHolderPoolFee > 0 && market.creator_id) {
      const { data: creator } = await supabase
        .from("creators")
        .select("total_coins_in_circulation, total_fees_distributed")
        .eq("id", market.creator_id)
        .single();

      const totalCoins = (creator as { total_coins_in_circulation: number } | null)?.total_coins_in_circulation || 1;
      const perCoin = fees.coinHolderPoolFee / totalCoins;

      {
        const { error } = await supabase.from("coin_holder_distributions").insert({
          market_id: marketId,
          trade_id: trade.id,
          creator_id: market.creator_id,
          total_pool_amount: fees.coinHolderPoolFee,
          per_coin_amount: perCoin,
          snapshot_holder_count: 0,
        });
        if (error) console.error('[trades] coin_holder_distributions insert failed:', error.message, error.details);
      }

      const prevDistributed = (creator as { total_fees_distributed: number } | null)?.total_fees_distributed || 0;
      await supabase
        .from("creators")
        .update({ total_fees_distributed: prevDistributed + fees.coinHolderPoolFee })
        .eq("id", market.creator_id);
    }

    return NextResponse.json({
      data: {
        trade,
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
