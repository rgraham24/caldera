import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";
import {
  discoverEntities,
  bulkGenerateAndInsert,
  fixStaleDates,
  curateHomepage,
} from "@/lib/admin/pipeline";

export const maxDuration = 60;

function checkAuth(desoPublicKey: string | undefined, adminPassword: string | undefined): boolean {
  return (
    ADMIN_KEYS.includes(desoPublicKey || "") ||
    !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD)
  );
}

// GET — called by Vercel cron (runs full cycle, no body)
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const supabase = await createClient();

    const entities = await discoverEntities(apiKey);
    const marketsCreated = await bulkGenerateAndInsert(entities, apiKey, supabase);
    const datesFixed = await fixStaleDates(supabase);
    const featuredUpdated = await curateHomepage(apiKey, supabase);

    return NextResponse.json({
      data: { entities: entities.length, markets_created: marketsCreated, dates_fixed: datesFixed, featured_updated: featuredUpdated },
    });
  } catch (err) {
    console.error("[autonomous-cycle] cron error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cycle failed" }, { status: 500 });
  }
}

// POST — step-by-step from admin panel, or "all" for legacy full run
export async function POST(req: NextRequest) {
  try {
    const { step = "all", entities: inputEntities, desoPublicKey, adminPassword } = await req.json();

    if (!checkAuth(desoPublicKey, adminPassword)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

    // ── Step: discover ────────────────────────────────────────────────────────
    if (step === "discover") {
      const entities = await discoverEntities(apiKey);
      return NextResponse.json({ data: { entities } });
    }

    // ── Step: generate ────────────────────────────────────────────────────────
    if (step === "generate") {
      if (!Array.isArray(inputEntities) || inputEntities.length === 0) {
        return NextResponse.json({ error: "entities array required for generate step" }, { status: 400 });
      }
      const supabase = await createClient();
      const marketsCreated = await bulkGenerateAndInsert(inputEntities, apiKey, supabase);
      return NextResponse.json({ data: { markets_created: marketsCreated } });
    }

    // ── Step: finalize ────────────────────────────────────────────────────────
    if (step === "finalize") {
      const supabase = await createClient();
      const datesFixed = await fixStaleDates(supabase);
      const featuredUpdated = await curateHomepage(apiKey, supabase);
      return NextResponse.json({ data: { dates_fixed: datesFixed, featured_updated: featuredUpdated } });
    }

    // ── Step: all (legacy / fallback) ─────────────────────────────────────────
    const supabase = await createClient();
    const entities = await discoverEntities(apiKey);
    const marketsCreated = await bulkGenerateAndInsert(entities, apiKey, supabase);
    const datesFixed = await fixStaleDates(supabase);
    const featuredUpdated = await curateHomepage(apiKey, supabase);

    return NextResponse.json({
      data: { entities: entities.length, markets_created: marketsCreated, dates_fixed: datesFixed, featured_updated: featuredUpdated },
    });
  } catch (err) {
    console.error("[autonomous-cycle] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cycle failed" }, { status: 500 });
  }
}
