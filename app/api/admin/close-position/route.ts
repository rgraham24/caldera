import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { password, positionMarketId } = await req.json();
  if (password !== "caldera-admin-2026") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .update({ status: "closed", quantity: 0, updated_at: new Date().toISOString() })
    .eq("market_id", positionMarketId)
    .eq("status", "open")
    .select();
  return NextResponse.json({ data, error: error?.message });
}
