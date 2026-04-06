import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateBuy } from "@/lib/caldra/engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { usdAmount } = await req.json();
  if (!usdAmount || usdAmount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const { data: tokenRaw } = await (supabase as any).from("caldra_token").select("*").limit(1).single();
  const token = tokenRaw as Record<string, any> | null;
  if (!token) return NextResponse.json({ error: "Token not initialized" }, { status: 500 });

  const result = calculateBuy({
    totalSupplyNanos: Number(token.total_supply_nanos) || 0,
    reserveBalanceUsd: Number(token.reserve_balance_usd) || 0,
    priceUsd: Number(token.price_usd) || 0.01,
  }, usdAmount);

  const { count } = await (supabase as any).from("caldra_holdings").select("*", { count: "exact", head: true }).eq("is_founding_holder", true);
  const isFoundingEligible = (count || 0) < 100;

  await (supabase as any).from("caldra_token").update({
    total_supply_nanos: result.newSupplyNanos,
    reserve_balance_usd: result.newReserve,
    price_usd: result.newPrice,
    total_volume_usd: Number(token.total_volume_usd || 0) + usdAmount,
    holder_count: Number(token.holder_count || 0) + 1,
  }).eq("id", token.id);

  const { data: existing } = await (supabase as any).from("caldra_holdings").select("*").eq("user_id", user.id).single();

  if (existing) {
    const newBal = Number(existing.balance_nanos) + result.tokensReceivedNanos;
    const newInv = Number(existing.total_invested_usd) + usdAmount;
    await (supabase as any).from("caldra_holdings").update({
      balance_nanos: newBal, total_invested_usd: newInv,
      avg_purchase_price_usd: newInv / (newBal / 1e9),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await (supabase as any).from("caldra_holdings").insert({
      user_id: user.id, balance_nanos: result.tokensReceivedNanos,
      avg_purchase_price_usd: result.newPrice, total_invested_usd: usdAmount,
      is_founding_holder: isFoundingEligible,
    });
  }

  await (supabase as any).from("caldra_trades").insert({
    user_id: user.id, operation: "buy", usd_amount: usdAmount,
    token_amount_nanos: result.tokensReceivedNanos, price_usd_at_trade: result.newPrice,
  });

  return NextResponse.json({ data: { tokensReceived: result.tokensReceivedNanos, newPrice: result.newPrice, isFoundingHolder: isFoundingEligible && !existing } });
}
