import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { marketId, side, shares } = body;

    // P2-1.5: Identity comes from middleware-verified session cookie.
    const authed = getAuthenticatedUser(req);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const desoPublicKey = authed.publicKey;

    if (!marketId || !shares || shares <= 0) {
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

    // Send DESO back to user from platform wallet (best-effort — don't fail sell if payout fails)
    let payoutTxnHash: string | null = null;
    try {
      const priceRes = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;
        if (desoUSD > 0 && returnAmount > 0) {
          const returnNanos = Math.floor((returnAmount / desoUSD) * 1e9);
          if (returnNanos > 10000) {
            const platformSeed = process.env.DESO_PLATFORM_SEED;
            const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY;
            const baseUrl = 'https://node.deso.org';
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
            const sendText = await sendRes.text();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let sendData: any = null;
            try { sendData = JSON.parse(sendText); } catch {
              console.error('[sell] send-deso returned non-JSON:', sendText.slice(0, 200));
            }
            if (sendData?.TransactionHex && platformSeed) {
              const { signTransactionWithSeed } = await import('@/lib/deso/server-sign');
              const signedHex = await signTransactionWithSeed(sendData.TransactionHex, platformSeed);
              const submitRes = await fetch(`${baseUrl}/api/v0/submit-transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ TransactionHex: signedHex }),
              });
              if (submitRes.ok) {
                const submitData = await submitRes.json();
                payoutTxnHash = submitData?.TxnHashHex ?? null;
                console.log(`[sell] ✅ Paid out ${returnNanos} nanos to ${desoPublicKey} — tx: ${payoutTxnHash}`);
              } else {
                console.error('[sell] submit failed:', await submitRes.text());
              }
            } else {
              console.error('[sell] send-deso failed or no TransactionHex:', sendData);
            }
          }
        }
      }
    } catch (payoutErr) {
      console.error('[sell] payout error (non-fatal):', payoutErr instanceof Error ? payoutErr.message : payoutErr);
    }

    // Record the sell trade
    try {
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
    } catch (tradeErr) {
      console.error("[sell] trade insert failed:", tradeErr);
      // non-fatal — position was already updated
    }

    return NextResponse.json({
      data: { sharesSold: sharesToSell, returnAmount, realizedPnl, newQuantity: Math.max(0, newQuantity), payoutTxnHash }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sell]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
