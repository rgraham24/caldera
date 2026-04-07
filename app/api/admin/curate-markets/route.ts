import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export const maxDuration = 30;

const FEATURED_COUNT = 8;

async function runCuration() {
  const supabase = await createClient();

  const { data: markets, error } = await supabase
    .from("markets")
    .select("id, total_volume, resolve_at, created_at")
    .eq("status", "open")
    .order("total_volume", { ascending: false })
    .limit(50);

  if (error || !markets?.length) {
    throw new Error("Failed to fetch markets");
  }

  const now = Date.now();
  const maxVolume = Math.max(...markets.map((m) => m.total_volume ?? 0), 1);

  const scored = markets.map((m) => {
    const volumeScore = ((m.total_volume ?? 0) / maxVolume) * 50;

    const msUntilResolve = m.resolve_at ? new Date(m.resolve_at).getTime() - now : Infinity;
    const daysUntilResolve = msUntilResolve / (1000 * 60 * 60 * 24);
    const urgencyScore =
      daysUntilResolve < 7 ? 30 : daysUntilResolve < 30 ? 20 : 5;

    const msOld = m.created_at ? now - new Date(m.created_at).getTime() : Infinity;
    const hoursOld = msOld / (1000 * 60 * 60);
    const recencyScore = hoursOld < 24 ? 20 : hoursOld < 168 ? 10 : 0;

    return { id: m.id, score: volumeScore + urgencyScore + recencyScore };
  });

  scored.sort((a, b) => b.score - a.score);
  const topIds = scored.slice(0, FEATURED_COUNT).map((m) => m.id);

  await supabase.from("markets").update({ is_hero: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("markets").update({ is_hero: true }).in("id", topIds);

  return { featured: topIds.length, total_evaluated: markets.length };
}

// GET — called by Vercel cron
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await runCuration();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[curate-markets] cron error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Curation failed" }, { status: 500 });
  }
}

// POST — manual trigger from admin panel
export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await runCuration();
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
