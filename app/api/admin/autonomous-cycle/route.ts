import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";
import {
  discoverEntities,
  bulkGenerateAndInsert,
  fixStaleDates,
  curateHomepage,
} from "@/lib/admin/pipeline";

async function runCycle() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const supabase = await createClient();

  // Step 1: Discover 15 hot entities
  const entities = await discoverEntities(apiKey);

  // Step 2: Generate markets for all entities in parallel + insert
  const marketsCreated = await bulkGenerateAndInsert(entities, apiKey, supabase);

  // Step 3: Fix stale far-future dates
  const datesFixed = await fixStaleDates(supabase);

  // Step 4: Curate homepage (update is_hero flags)
  const featuredUpdated = await curateHomepage(apiKey, supabase);

  return {
    entities: entities.length,
    markets_created: marketsCreated,
    dates_fixed: datesFixed,
    featured_updated: featuredUpdated,
  };
}

// GET — called by Vercel cron (no body, checks x-vercel-cron header)
export async function GET(req: NextRequest) {
  const isVercelCron = !!req.headers.get("x-vercel-cron");
  if (!isVercelCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runCycle();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[autonomous-cycle] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cycle failed" },
      { status: 500 }
    );
  }
}

// POST — called manually from admin panel
export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await runCycle();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[autonomous-cycle] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cycle failed" },
      { status: 500 }
    );
  }
}
