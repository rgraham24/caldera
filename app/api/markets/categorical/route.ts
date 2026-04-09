import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MarketWithOutcomes } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const marketId = req.nextUrl.searchParams.get("market_id");

    // market_outcomes table exists in Supabase but not in generated types — use any cast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from("markets")
      .select("*, market_outcomes(*)")
      .eq("market_type", "categorical");

    if (marketId) {
      query = query.eq("id", marketId);
    } else {
      query = query.eq("status", "open").order("created_at", { ascending: false }).limit(3);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: (data ?? []) as MarketWithOutcomes[] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
