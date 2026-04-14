import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

/**
 * GET /api/admin/auto-resolve-status?adminPassword=...
 * Returns markets that Claude flagged for manual review (resolution_note LIKE 'AI_FLAGGED%').
 */
export async function GET(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("adminPassword");
  const dk = searchParams.get("desoPublicKey");
  const authHeader = req.headers.get("authorization");

  const isAdmin =
    ADMIN_KEYS.includes(dk || "") ||
    pw === adminPassword ||
    authHeader === `Bearer ${adminPassword}`;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select(
      "id, title, category, yes_price, no_price, total_volume, resolve_at, description, resolution_note"
    )
    .eq("status", "open")
    .like("resolution_note", "AI_FLAGGED%")
    .order("resolve_at", { ascending: true })
    .limit(50);

  // Parse Claude's suggested outcome and confidence from the resolution_note
  const parsed = (markets ?? []).map((m) => {
    const note = m.resolution_note ?? "";
    const confidenceMatch = note.match(/\[(\d+)%\s*confidence,\s*suggested:\s*(yes|no|unknown)\]/i);
    const reasoningMatch = note.match(/\]:\s*(.+?)\s*\|\s*Source hint:/);
    const sourceMatch = note.match(/Source hint:\s*(.+)$/);

    return {
      ...m,
      ai_suggested_outcome: confidenceMatch?.[2] ?? null,
      ai_confidence: confidenceMatch?.[1] ? parseInt(confidenceMatch[1]) : null,
      ai_reasoning: reasoningMatch?.[1] ?? note.replace(/^AI_FLAGGED.*?\]:\s*/, ""),
      ai_source_hint: sourceMatch?.[1] ?? null,
    };
  });

  return NextResponse.json({ data: parsed });
}
