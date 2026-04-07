import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ADMIN_KEYS = [
  "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
];

const resolveSchema = z.object({
  outcome: z.enum(["yes", "no", "cancelled"]),
  sourceUrl: z.string().optional(),
  notes: z.string().optional(),
  desoPublicKey: z.string(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const body = await req.json();
    const parsed = resolveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { outcome, sourceUrl, notes, desoPublicKey } = parsed.data;

    if (!ADMIN_KEYS.includes(desoPublicKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update market
    const now = new Date().toISOString();
    const { error: marketError } = await supabase
      .from("markets")
      .update({
        status: outcome === "cancelled" ? "cancelled" : "resolved",
        resolution_outcome: outcome,
        resolved_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (marketError) {
      return NextResponse.json(
        { error: "Failed to resolve market" },
        { status: 500 }
      );
    }

    // Insert resolution record
    await supabase.from("market_resolutions").insert({
      market_id: id,
      resolved_by_user_id: null,
      outcome,
      source_url: sourceUrl,
      notes,
    });

    // Settle positions
    if (outcome !== "cancelled") {
      const winningSide = outcome; // "yes" or "no"

      // Get all open positions for this market
      const { data: positions } = await supabase
        .from("positions")
        .select("*")
        .eq("market_id", id)
        .eq("status", "open");

      if (positions) {
        for (const pos of positions) {
          const won = pos.side === winningSide;
          const payout = won ? pos.quantity : 0; // Each winning share pays $1
          const realizedPnl = payout - pos.total_cost;

          await supabase
            .from("positions")
            .update({
              status: "settled",
              realized_pnl: realizedPnl,
              unrealized_pnl_cached: 0,
              updated_at: now,
            })
            .eq("id", pos.id);
        }
      }
    }

    return NextResponse.json({ data: { resolved: true, outcome } });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
