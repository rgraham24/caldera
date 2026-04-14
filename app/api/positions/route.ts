import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/positions?marketId=...&desoPublicKey=...
 * Returns the user's open position for a given market.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId");
  const desoPublicKey = searchParams.get("desoPublicKey");

  if (!marketId || !desoPublicKey) {
    return NextResponse.json({ data: null });
  }

  const supabase = await createClient();

  // Look up user by DeSo public key
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("deso_public_key", desoPublicKey)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ data: null });
  }

  const { data: position } = await supabase
    .from("positions")
    .select("side, quantity, avg_entry_price, total_cost, unrealized_pnl_cached")
    .eq("market_id", marketId)
    .eq("user_id", user.id)
    .eq("status", "open")
    .maybeSingle();

  if (!position) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: {
      side: position.side,
      shares: position.quantity,
      avgPrice: position.avg_entry_price,
      totalCost: position.total_cost,
      unrealizedPnl: position.unrealized_pnl_cached,
    },
  });
}
