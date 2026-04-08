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

    // Fetch open markets created in the last 7 days (include total_volume for safety check)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const FAR_FUTURE_CUTOFF = "2026-09-01T00:00:00Z";

    const { data: markets, error } = await supabase
      .from("markets")
      .select("id, title, description, category, resolve_at, total_volume")
      .eq("status", "open")
      .gte("created_at", sevenDaysAgo);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!markets?.length) {
      return NextResponse.json({ data: { deleted: 0, kept: 0, skipped_has_volume: 0, deleted_far_future: 0, message: "No recent markets to validate" } });
    }

    // Pass 1: delete zero-volume markets with resolve_at > Sept 2026 (too far out, no AI needed)
    const farFutureIds = markets
      .filter((m) => (m.total_volume ?? 0) === 0 && m.resolve_at && m.resolve_at > FAR_FUTURE_CUTOFF)
      .map((m) => m.id);

    let deletedFarFuture = 0;
    if (farFutureIds.length > 0) {
      const { error: ffErr } = await supabase
        .from("markets")
        .delete()
        .in("id", farFutureIds)
        .eq("total_volume", 0)
        .gt("resolve_at", FAR_FUTURE_CUTOFF);
      if (!ffErr) deletedFarFuture = farFutureIds.length;
    }

    // Pass 2: run remaining markets through the AI relevance gatekeeper
    const remaining = markets.filter((m) => !farFutureIds.includes(m.id));
    if (remaining.length === 0) {
      return NextResponse.json({
        data: {
          deleted: 0,
          kept: 0,
          skipped_has_volume: 0,
          deleted_far_future: deletedFarFuture,
          message: `Deleted ${deletedFarFuture} far-future markets — no remaining markets to validate`,
        },
      });
    }

    const keptIds = await filterStaleMarketsPublic(remaining, apiKey);
    const keptSet = new Set(keptIds);
    const failed = remaining.filter((m) => !keptSet.has(m.id));

    // Safety: never delete markets with trades (users may have positions)
    const toDelete = failed.filter((m) => (m.total_volume ?? 0) === 0).map((m) => m.id);
    const skippedHasVolume = failed.length - toDelete.length;

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("markets")
        .delete()
        .in("id", toDelete)
        .eq("total_volume", 0);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    }

    const totalDeleted = toDelete.length + deletedFarFuture;
    const parts = [
      `Deleted ${totalDeleted} markets (${toDelete.length} stale + ${deletedFarFuture} far-future)`,
      `kept ${keptIds.length}`,
      skippedHasVolume > 0 ? `skipped ${skippedHasVolume} with trades` : null,
    ].filter(Boolean).join(", ");

    return NextResponse.json({
      data: {
        deleted: toDelete.length,
        kept: keptIds.length,
        skipped_has_volume: skippedHasVolume,
        deleted_far_future: deletedFarFuture,
        message: parts,
      },
    });
  } catch (err) {
    console.error("[validate-existing-markets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
