import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { tradeAmountUsd } = await req.json();
  if (!tradeAmountUsd || tradeAmountUsd <= 0) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const caldraFee = Math.round(tradeAmountUsd * 0.005 * 100) / 100;

  const { data: token } = await (supabase as any)
    .from("caldra_token")
    .select("id, total_supply_nanos, total_distributed_usd")
    .limit(1)
    .single() as { data: Record<string, any> | null };

  if (!token || Number(token.total_supply_nanos) === 0) {
    return NextResponse.json({ data: { distributed: 0 } });
  }

  const totalSupply = Number(token.total_supply_nanos);

  // Update token total distributed
  await (supabase as any)
    .from("caldra_token")
    .update({
      total_distributed_usd: Number(token.total_distributed_usd || 0) + caldraFee,
    })
    .eq("id", token.id);

  // Distribute to holders proportionally
  const { data: holders } = await (supabase as any)
    .from("caldra_holdings")
    .select("id, balance_nanos, total_earned_usd")
    .gt("balance_nanos", 0);

  if (holders && holders.length > 0) {
    for (const h of holders) {
      const share = Number(h.balance_nanos) / totalSupply;
      const earned = Math.round(caldraFee * share * 100) / 100;
      if (earned > 0) {
        await (supabase as any)
          .from("caldra_holdings")
          .update({
            total_earned_usd: Number(h.total_earned_usd || 0) + earned,
          })
          .eq("id", h.id);
      }
    }
  }

  return NextResponse.json({ data: { distributed: caldraFee } });
}
