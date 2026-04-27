import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { resolveMarket } from "@/lib/markets/resolution";
import { isAdminAuthorized } from "@/lib/admin/auth";

const resolveSchema = z.object({
  outcome: z.enum(["yes", "no", "cancelled"]),
  sourceUrl: z.string().optional(),
  notes: z.string().optional(),
  desoPublicKey: z.string().optional(),
  adminPassword: z.string().optional(),
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

    const { outcome, sourceUrl, notes, desoPublicKey, adminPassword } =
      parsed.data;

    if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Atomic resolution via shared lib (P3-3.3 / P3-3.2 RPC).
    // Note: cancelled markets now also settle all positions as losers
    // (realized_pnl = -total_cost). Previously cancelled markets left
    // positions in status='open'. New behavior is intentional per
    // P3-3 design doc OQ-1; refunds are a future feature.
    const result = await resolveMarket(supabase, {
      marketId: id,
      outcome,
      resolutionNote: notes ?? null,
      sourceUrl: sourceUrl ?? null,
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

    return NextResponse.json({ data: { resolved: true, outcome } });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
