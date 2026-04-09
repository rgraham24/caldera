import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";
import {
  discoverEntities,
  bulkGenerateAndInsert,
  fixStaleDates,
  curateHomepage,
  resolveExpiredMarkets,
  generateMarketsForImportedCreators,
  checkPendingClaims,
} from "@/lib/admin/pipeline";

const rateLimitMap = new Map<string, number>();

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

  // Step 1: Discover trending entities and generate markets
  const entities = await discoverEntities(apiKey);
  const marketsCreated = await bulkGenerateAndInsert(entities, apiKey, supabase);

  // Step 2: Resolve expired markets before fixing dates or curating
  const { resolved, flagged } = await resolveExpiredMarkets(apiKey, supabase);
  console.log(`[cycle] Resolution: ${resolved} resolved, ${flagged} flagged for review`);

  // Step 3: Fix stale dates and curate homepage
  const datesFixed = await fixStaleDates(supabase);
  const featuredUpdated = await curateHomepage(apiKey, supabase);

  // Step 4: Generate markets for imported creators with 0 markets
  const importedMarketsCreated = await generateMarketsForImportedCreators(apiKey, supabase, 10);
  console.log(`[cycle] Generated ${importedMarketsCreated} markets for imported creators`);

  // Step 5: Auto-void needs_review markets older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleReviews } = await supabase
    .from("markets")
    .select("id")
    .eq("status", "needs_review")
    .lt("resolved_at", sevenDaysAgo);

  let autoVoided = 0;
  if (staleReviews?.length) {
    await supabase
      .from("markets")
      .update({ status: "voided", resolution_note: "Auto-voided after 7 days without manual review" })
      .in("id", staleReviews.map((m) => m.id));
    autoVoided = staleReviews.length;
    console.log(`[cycle] Auto-voided ${autoVoided} stale needs_review markets`);
  }

  // Step 6: Auto-claim verification (checks if claim codes have been posted publicly)
  const autoClaimed = await checkPendingClaims(supabase);
  if (autoClaimed > 0) console.log(`[cycle] Auto-claimed ${autoClaimed} profiles`);

  // Step 7: Weekly DeSo profile sync (Mondays only)
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday
  if (dayOfWeek === 1) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    for (let batchIndex = 0; batchIndex <= 3; batchIndex++) {
      try {
        const batchRes = await fetch(`${baseUrl}/api/admin/bulk-import-deso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchIndex,
            adminPassword: process.env.ADMIN_PASSWORD,
            minHolders: 0,
          }),
        });
        const batchData = await batchRes.json();
        console.log(`[cycle] Weekly DeSo sync batch ${batchIndex}: +${batchData.data?.totalImported ?? 0}`);
      } catch (err) {
        console.warn(`[cycle] Weekly DeSo sync batch ${batchIndex} failed:`, err);
      }
    }
  }

  return {
    entities: entities.length,
    markets_created: marketsCreated,
    markets_resolved: resolved,
    markets_flagged: flagged,
    dates_fixed: datesFixed,
    featured_updated: featuredUpdated,
    imported_markets_created: importedMarketsCreated,
    auto_voided: autoVoided,
    auto_claimed: autoClaimed,
  };
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
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const now = Date.now();
  const last = rateLimitMap.get(ip) ?? 0;
  if (now - last < 60000) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }
  rateLimitMap.set(ip, now);

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
