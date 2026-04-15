import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { marketId, side, shares, desoPublicKey } = body;

    if (!desoPublicKey || !marketId || !shares || shares <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createClient();

    // Look up user
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("deso_public_key", desoPublicKey)
      .single();

    if (!user) {
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

    // Get position
    const { data: position } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", user.id)
      .eq("market_id", marketId)
      .eq("side", side)
      .single();

    if (!position || (position.quantity ?? 0) < shares) {
      return NextResponse.json({ error: "Insufficient position" }, { status: 400 });
    }

    const currentPrice = side === "yes" ? (market.yes_price ?? 0.5) : (market.no_price ?? 0.5);
    const returnAmount = shares * currentPrice;
    const realizedPnl = (currentPrice - (position.avg_entry_price ?? 0)) * shares;

    const newQuantity = (position.quantity ?? 0) - shares;

    if (newQuantity <= 0.0001) {
      // Close position entirely
      await supabase.from("positions").update({
        quantity: 0,
        status: "closed",
        realized_pnl: (position.realized_pnl ?? 0) + realizedPnl,
        updated_at: new Date().toISOString(),
      }).eq("id", position.id);
    } else {
      await supabase.from("positions").update({
        quantity: newQuantity,
        realized_pnl: (position.realized_pnl ?? 0) + realizedPnl,
        updated_at: new Date().toISOString(),
      }).eq("id", position.id);
    }

    // Record the sell trade
    await supabase.from("trades").insert({
      user_id: user.id,
      market_id: marketId,
      side,
      action_type: "sell",
      quantity: shares,
      price: currentPrice,
      gross_amount: returnAmount,
      fee_amount: 0,
      platform_fee_amount: 0,
      creator_fee_amount: 0,
      market_creator_fee_amount: 0,
      coin_holder_pool_amount: 0,
    });

    return NextResponse.json({
      data: {
        sharesSOld: shares,
        returnAmount,
        realizedPnl,
        newQuantity: Math.max(0, newQuantity),
      }
    });
  } catch (err) {
    console.error("[sell]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
