import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMarket } from "@/lib/markets/resolution";
import { isAdminAuthorized } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    marketId,
    outcome,
    adminPassword: pw,
    desoPublicKey,
    resolutionNote,
  } = body as {
    marketId?: string;
    outcome?: string;
    adminPassword?: string;
    desoPublicKey?: string;
    resolutionNote?: string;
  };

  if (!isAdminAuthorized(pw, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!marketId) {
    return NextResponse.json({ error: "marketId required" }, { status: 400 });
  }
  if (outcome !== "yes" && outcome !== "no") {
    return NextResponse.json(
      { error: "outcome must be 'yes' or 'no'" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Fetch market for the response payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market, error: marketErr } = await (supabase as any)
    .from("markets")
    .select("id, title, status")
    .eq("id", marketId)
    .maybeSingle();

  if (marketErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  // Atomic resolution via shared lib (P3-3.3 / P3-3.2 RPC)
  const result = await resolveMarket(supabase, {
    marketId,
    outcome,
    resolutionNote: resolutionNote ?? null,
    sourceUrl: null,
    resolvedByUserId: null,
  });

  if (!result.ok) {
    if (result.reason === "market-already-resolved-or-not-found") {
      return NextResponse.json(
        { error: "Market is not open for resolution", reason: result.reason },
        { status: 409 }
      );
    }
    if (result.reason === "invalid-outcome") {
      return NextResponse.json(
        { error: result.detail, reason: result.reason },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: result.detail, reason: result.reason },
      { status: 500 }
    );
  }

  // Re-fetch the market for response payload (unchanged contract)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedMarket } = await (supabase as any)
    .from("markets")
    .select()
    .eq("id", marketId)
    .single();

  return NextResponse.json({
    success: true,
    market: updatedMarket,
    positionsSettled: result.positionsSettled,
    winnersCount: result.winnersCount,
    totalPaidOut: Math.round(result.totalPayoutUsd * 100) / 100,
  });
}
