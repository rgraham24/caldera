import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { marketId, outcome, adminPassword: pw, desoPublicKey, resolutionNote } = body as {
    marketId?: string;
    outcome?: string;
    adminPassword?: string;
    desoPublicKey?: string;
    resolutionNote?: string;
  };

  const isAdmin =
    ADMIN_KEYS.includes(desoPublicKey || "") ||
    pw === adminPassword;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!marketId) {
    return NextResponse.json({ error: "marketId required" }, { status: 400 });
  }
  if (outcome !== "yes" && outcome !== "no") {
    return NextResponse.json({ error: "outcome must be 'yes' or 'no'" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch market
  const { data: market, error: marketErr } = await supabase
    .from("markets")
    .select("id, title, status")
    .eq("id", marketId)
    .maybeSingle();

  if (marketErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Update market to resolved
  const { data: updatedMarket, error: updateErr } = await supabase
    .from("markets")
    .update({
      status: "resolved",
      resolution_outcome: outcome,
      resolved_at: now,
      ...(resolutionNote ? { resolution_source_url: resolutionNote } : {}),
    })
    .eq("id", marketId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Settle all open positions
  const { data: positions } = await supabase
    .from("positions")
    .select("id, side, quantity, total_cost")
    .eq("market_id", marketId)
    .eq("status", "open");

  let winnersCount = 0;
  let totalPaidOut = 0;

  if (positions && positions.length > 0) {
    for (const pos of positions) {
      const isWinner = pos.side === outcome;
      // Winners get $1 per share; pnl = payout - cost
      const realizedPnl = isWinner
        ? (pos.quantity ?? 0) * 1.0 - (pos.total_cost ?? 0)
        : -(pos.total_cost ?? 0);

      await supabase
        .from("positions")
        .update({ status: "settled", realized_pnl: realizedPnl })
        .eq("id", pos.id);

      if (isWinner) {
        winnersCount++;
        totalPaidOut += (pos.quantity ?? 0) * 1.0;
      }
    }
  }

  // Insert resolution record (non-critical)
  try {
    await supabase.from("market_resolutions").insert({
      market_id: marketId,
      outcome,
      notes: resolutionNote ?? null,
      created_at: now,
    });
  } catch { /* non-critical */ }

  return NextResponse.json({
    success: true,
    market: updatedMarket,
    positionsSettled: positions?.length ?? 0,
    winnersCount,
    totalPaidOut: Math.round(totalPaidOut * 100) / 100,
  });
}
