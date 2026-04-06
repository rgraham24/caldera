import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const supabase = await createClient();

  const { data: token } = await (supabase as any)
    .from("caldra_token")
    .select("*")
    .limit(1)
    .single() as { data: Record<string, any> | null };

  const { data: { user } } = await supabase.auth.getUser();

  let holdings = null;
  if (user) {
    const { data } = await (supabase as any)
      .from("caldra_holdings")
      .select("*")
      .eq("user_id", user.id)
      .single() as { data: Record<string, any> | null };
    holdings = data;
  }

  const { count: foundingRemaining } = await (supabase as any)
    .from("caldra_holdings")
    .select("*", { count: "exact", head: true })
    .eq("is_founding_holder", true);

  return NextResponse.json({
    data: {
      price: token?.price_usd || 0.01,
      priceChange24h: token?.price_change_24h || 0,
      holderCount: token?.holder_count || 0,
      totalSupply: token?.total_supply_nanos || 0,
      totalVolume: token?.total_volume_usd || 0,
      totalDistributed: token?.total_distributed_usd || 0,
      reserve: token?.reserve_balance_usd || 0,
      foundingSpotsRemaining: Math.max(0, 100 - (foundingRemaining || 0)),
      yourHoldings: holdings ? {
        balanceNanos: holdings.balance_nanos,
        balanceUsd: (holdings.balance_nanos / 1e9) * (token?.price_usd || 0.01),
        totalInvested: holdings.total_invested_usd,
        totalEarned: holdings.total_earned_usd,
        isFoundingHolder: holdings.is_founding_holder,
      } : null,
    },
  });
}
