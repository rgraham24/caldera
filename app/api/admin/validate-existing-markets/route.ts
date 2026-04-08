import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { filterStaleMarketsPublic } from "@/lib/admin/pipeline";

const ADMIN_PASSWORD = "caldera-admin-2026";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const supabase = await createClient();

    // Fetch open markets created in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: markets, error } = await supabase
      .from("markets")
      .select("id, title, description, category, resolve_at")
      .eq("status", "open")
      .gte("created_at", sevenDaysAgo);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!markets?.length) {
      return NextResponse.json({ data: { deleted: 0, kept: 0, message: "No recent markets to validate" } });
    }

    // Run through relevance gatekeeper — returns IDs to KEEP
    const keptIds = await filterStaleMarketsPublic(markets, apiKey);
    const keptSet = new Set(keptIds);
    const toDelete = markets.filter((m) => !keptSet.has(m.id)).map((m) => m.id);

    if (toDelete.length === 0) {
      return NextResponse.json({ data: { deleted: 0, kept: markets.length, message: "All markets passed relevance check" } });
    }

    // Delete stale markets
    const { error: deleteError } = await supabase
      .from("markets")
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        deleted: toDelete.length,
        kept: keptIds.length,
        message: `Deleted ${toDelete.length} stale markets, kept ${keptIds.length}`,
      },
    });
  } catch (err) {
    console.error("[validate-existing-markets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
