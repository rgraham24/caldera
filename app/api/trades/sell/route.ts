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

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Get market for current price
    const { data: market } = await supabase
      .from("markets")
      .select("yes_price, no_price, status")
      .eq("id", marketId)
      .single();

    if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.status !== "open") return NextResponse.json({ error: "Market is closed" }, { status: 400 });

    // Get open position — filter by user + market + side + open status
    const { data: positions } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", user.id)
      .eq("market_id", marketId)
      .eq("side", side)
      .neq("status", "closed")
      .order("created_at", { ascending: true });

    const position = positions?.[0];
    if (!position) return NextResponse.json({ error: "No open position found" }, { status: 404 });

    const sharesToSell = Math.min(shares, position.quantity ?? 0);
    const currentPrice = side === "yes" ? (market.yes_price ?? 0.5) : (market.no_price ?? 0.5);
    const returnAmount = sharesToSell * currentPrice;
    const realizedPnl = (currentPrice - (position.avg_entry_price ?? 0.5)) * sharesToSell;
    const newQuantity = (position.quantity ?? 0) - sharesToSell;

    if (newQuantity < 0.001) {
      // Close position entirely
      const { error } = await supabase
        .from("positions")
        .update({
          quantity: 0,
          status: "closed",
          realized_pnl: (position.realized_pnl ?? 0) + realizedPnl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", position.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("positions")
        .update({
          quantity: newQuantity,
          realized_pnl: (position.realized_pnl ?? 0) + realizedPnl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", position.id);
      if (error) throw error;
    }

    // Send DESO back to user from platform wallet
    const priceRes = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
    const priceData = await priceRes.json();
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;

    if (desoUSD > 0 && returnAmount > 0) {
      const returnNanos = Math.floor((returnAmount / desoUSD) * 1e9);
      if (returnNanos > 10000) {
        const platformSeed = process.env.DESO_PLATFORM_SEED;
        const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY;
        const baseUrl = process.env.DESO_NODE_URL || 'https://node.deso.org';

        const sendRes = await fetch(`${baseUrl}/api/v0/send-deso`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SenderPublicKeyBase58Check: platformPublicKey,
            RecipientPublicKeyOrUsername: desoPublicKey,
            AmountNanos: returnNanos,
            MinFeeRateNanosPerKB: 1000,
          }),
        });
        const sendData = await sendRes.json();

        if (sendData?.TransactionHex && platformSeed) {
          const signRes = await fetch('https://identity.deso.org/api/v0/sign-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TransactionHex: sendData.TransactionHex, Seed: platformSeed }),
          });
          const signData = signRes.ok ? await signRes.json() : null;
          const signedHex = signData?.SignedTransactionHex ?? sendData.TransactionHex;

          const submitRes = await fetch(`${baseUrl}/api/v0/submit-transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TransactionHex: signedHex }),
          });
          if (submitRes.ok) {
            const submitData = await submitRes.json();
            console.log(`[sell] ✅ Paid out ${returnNanos} nanos to ${desoPublicKey} — tx: ${submitData.TxnHashHex}`);
          }
        }
      }
    }

    // Record the sell trade
    await supabase.from("trades").insert({
      user_id: user.id,
      market_id: marketId,
      side,
      action_type: "sell",
      quantity: sharesToSell,
      price: currentPrice,
      gross_amount: returnAmount,
      fee_amount: 0,
      platform_fee_amount: 0,
      creator_fee_amount: 0,
      market_creator_fee_amount: 0,
      coin_holder_pool_amount: 0,
    });

    return NextResponse.json({
      data: { sharesSold: sharesToSell, returnAmount, realizedPnl, newQuantity: Math.max(0, newQuantity) }
    });
  } catch (err) {
    console.error("[sell]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
