import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateSell } from "@/lib/caldra/engine";
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tokenAmountNanos } = await req.json();
  if (!tokenAmountNanos || tokenAmountNanos <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const { data: holdings } = await (supabase as any)
    .from("caldra_holdings")
    .select("*")
    .eq("user_id", user.id)
    .single() as { data: Record<string, any> | null };

  if (!holdings || Number(holdings.balance_nanos) < tokenAmountNanos) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const { data: token } = await (supabase as any)
    .from("caldra_token")
    .select("*")
    .limit(1)
    .single() as { data: Record<string, any> | null };

  if (!token) return NextResponse.json({ error: "Token not initialized" }, { status: 500 });

  const result = calculateSell(
    {
      totalSupplyNanos: Number(token.total_supply_nanos),
      reserveBalanceUsd: Number(token.reserve_balance_usd),
      priceUsd: Number(token.price_usd),
    },
    tokenAmountNanos
  );

  await (supabase as any)
    .from("caldra_token")
    .update({
      total_supply_nanos: result.newSupplyNanos,
      reserve_balance_usd: result.newReserve,
      price_usd: result.newPrice,
      total_volume_usd: Number(token.total_volume_usd || 0) + result.usdReceived,
    })
    .eq("id", token.id);

  await (supabase as any)
    .from("caldra_holdings")
    .update({
      balance_nanos: Number(holdings.balance_nanos) - tokenAmountNanos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", holdings.id);

  await (supabase as any).from("caldra_trades").insert({
    user_id: user.id,
    operation: "sell",
    usd_amount: result.usdReceived,
    token_amount_nanos: tokenAmountNanos,
    price_usd_at_trade: result.newPrice,
  });

  return NextResponse.json({
    data: { usdReceived: result.usdReceived, newPrice: result.newPrice },
  });
}
