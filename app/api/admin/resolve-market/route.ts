import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export async function POST(req: NextRequest) {
  const { marketId, outcome, note, adminPassword, desoPublicKey } = await req.json();

  const isAdmin =
    ADMIN_KEYS.includes(desoPublicKey || "") ||
    !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!["yes", "no", "void"].includes(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("markets")
    .update({
      resolution_outcome: outcome,
      resolution_source: note ?? "",
      resolved_at: new Date().toISOString(),
      status: "resolved",
    })
    .eq("id", marketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
