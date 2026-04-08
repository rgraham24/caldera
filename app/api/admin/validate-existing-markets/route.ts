import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_PASSWORD = "caldera-admin-2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    const now = new Date();
    const farFutureCutoff = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // now + 120 days
    const oldMarketCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);  // now - 30 days

    // 1. Fetch all open markets
    const { data: markets, error: marketsErr } = await supabase
      .from("markets")
      .select("id, title, resolve_at, created_at")
      .eq("status", "open");

    if (marketsErr) return NextResponse.json({ error: marketsErr.message }, { status: 500 });
    if (!markets?.length) {
      return NextResponse.json({ data: { deleted: 0, kept: 0, message: "No open markets found" } });
    }

    // 2. Fetch market IDs that have real trades
    const { data: tradeRows } = await supabase
      .from("trades")
      .select("market_id")
      .in("market_id", markets.map((m) => m.id));

    const hasRealTrades = new Set((tradeRows ?? []).map((r) => r.market_id));

    // 3. Apply hard SQL-equivalent rules client-side — delete if NO real trades AND any condition matches
    const VAGUE = ["someday", "eventually", "at some point", "by end of 2026"];

    const toDelete = markets.filter((m) => {
      if (hasRealTrades.has(m.id)) return false; // never delete markets with real trades

      const resolveAt = m.resolve_at ? new Date(m.resolve_at) : null;
      const createdAt = m.created_at ? new Date(m.created_at) : null;
      const titleLower = m.title.toLowerCase();

      // resolve_at > now + 120 days (too far future)
      if (resolveAt && resolveAt > farFutureCutoff) return true;
      // resolve_at < now (already expired)
      if (resolveAt && resolveAt < now) return true;
      // vague title language
      if (VAGUE.some((phrase) => titleLower.includes(phrase))) return true;
      // old market with no traction
      if (createdAt && createdAt < oldMarketCutoff) return true;

      return false;
    });

    const toDeleteIds = toDelete.map((m) => m.id);

    if (toDeleteIds.length === 0) {
      return NextResponse.json({
        data: { deleted: 0, kept: markets.length, message: "All markets passed — nothing to delete" },
      });
    }

    const { error: deleteErr } = await supabase
      .from("markets")
      .delete()
      .in("id", toDeleteIds);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    const kept = markets.length - toDeleteIds.length;
    return NextResponse.json({
      data: {
        deleted: toDeleteIds.length,
        kept,
        message: `Deleted ${toDeleteIds.length} markets, kept ${kept}`,
      },
    });
  } catch (err) {
    console.error("[validate-existing-markets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
