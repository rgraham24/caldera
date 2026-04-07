import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";
import {
  discoverEntities,
  bulkGenerateAndInsert,
  fixStaleDates,
  curateHomepage,
} from "@/lib/admin/pipeline";

export const maxDuration = 300;

function checkAuth(desoPublicKey: string | undefined, adminPassword: string | undefined): boolean {
  return (
    ADMIN_KEYS.includes(desoPublicKey || "") ||
    !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD)
  );
}

async function runCycle() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const supabase = await createClient();

  const entities = await discoverEntities(apiKey);
  const marketsCreated = await bulkGenerateAndInsert(entities, apiKey, supabase);
  const datesFixed = await fixStaleDates(supabase);
  const featuredUpdated = await curateHomepage(apiKey, supabase);

  return { entities: entities.length, markets_created: marketsCreated, dates_fixed: datesFixed, featured_updated: featuredUpdated };
}

// GET — called by Vercel cron
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await runCycle();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[autonomous-cycle] cron error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cycle failed" }, { status: 500 });
  }
}

// POST — manual trigger from admin panel
export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    if (!checkAuth(desoPublicKey, adminPassword)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await runCycle();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[autonomous-cycle] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cycle failed" }, { status: 500 });
  }
}
