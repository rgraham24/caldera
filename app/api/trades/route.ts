import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTradeQuote } from "@/lib/trading/amm";
import { calculateFees, getMarketFeeType } from "@/lib/fees/calculator";
import { z } from "zod";

const tradeSchema = z.object({
  marketId: z.string().min(1),
  side: z.enum(["yes", "no"]),
  amount: z.number().positive(),
  txnHash: z.string().optional(),
  desoPublicKey: z.string().optional(),
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

    const { marketId, side, amount, txnHash, desoPublicKey } = parsed.data;

    if (!desoPublicKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Calculate fees
    const feeType = getMarketFeeType(market);
    const fees = calculateFees(amount, feeType, feeConfig);

    // Fire-and-forget buyback event — never blocks the trade
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkt = market as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("buyback_events").insert({
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
    });

    // Calculate trade quote with net amount (after fees)
    const quote = getTradeQuote(
      { yesPool: market.yes_pool, noPool: market.no_pool },
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
        total_volume: market.total_volume + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", marketId);

    if (marketError) {
      return NextResponse.json(
        { error: "Failed to update market" },
        { status: 500 }
      );
    }

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
      const newQuantity = existingPosition.quantity + quote.sharesReceived;
      const newTotalCost = existingPosition.total_cost + fees.netAmount;
      const newAvgEntry = newTotalCost / newQuantity;

      await supabase
        .from("positions")
        .update({
          quantity: newQuantity,
          avg_entry_price: newAvgEntry,
          total_cost: newTotalCost,
          fees_paid: existingPosition.fees_paid + fees.totalFee,
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

    // Insert fee earnings
    if (fees.platformFee > 0) {
      await supabase.from("fee_earnings").insert({
        recipient_type: "platform",
        source_type: "trade",
        source_id: trade.id,
        amount: fees.platformFee,
      });
    }
    if (fees.creatorFee > 0 && market.creator_id) {
      await supabase.from("fee_earnings").insert({
        recipient_type: "creator",
        recipient_id: market.creator_id,
        source_type: "trade",
        source_id: trade.id,
        amount: fees.creatorFee,
      });
    }
    if (fees.marketCreatorFee > 0 && market.created_by_user_id) {
      await supabase.from("fee_earnings").insert({
        recipient_type: "market_creator",
        recipient_id: market.created_by_user_id,
        source_type: "trade",
        source_id: trade.id,
        amount: fees.marketCreatorFee,
      });
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

      await supabase.from("coin_holder_distributions").insert({
        market_id: marketId,
        trade_id: trade.id,
        creator_id: market.creator_id,
        total_pool_amount: fees.coinHolderPoolFee,
        per_coin_amount: perCoin,
        snapshot_holder_count: 0,
      });

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
