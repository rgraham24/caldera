import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";
import {
  fixStaleDates,
  curateHomepage,
  resolveExpiredMarkets,
  checkPendingClaims,
  backfillCreatorSlugs,
  processPendingDesoCreations,
  auditAndFixReservedProfiles,
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

  // ── Generation steps removed in Phase D-2a (2026-05-02) ──
  // Steps 1, 1b, 1c, 4 produced creator-less markets that hard-fail
  // the v2 trade route. The orchestration shell + ledger fixers are
  // preserved below.

  // Step 1x: Remove exact-title duplicates (keep oldest)
  let dupesDeleted = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dupeCheck } = await (supabase as any).rpc('delete_duplicate_markets');
    dupesDeleted = typeof dupeCheck === 'number' ? dupeCheck : 0;
    if (dupesDeleted > 0) console.log(`[cycle] Deleted ${dupesDeleted} duplicate markets`);
  } catch (err) {
    console.warn('[cycle] delete_duplicate_markets RPC not available:', err);
  }

  // Step 1a: Backfill creator slugs on existing markets that lack them
  const backfilled = await backfillCreatorSlugs(supabase, 30);
  if (backfilled > 0) console.log(`[cycle] Backfilled creator slugs: ${backfilled}`);

  // Step 2: Resolve expired markets before fixing dates or curating
  const { resolved, flagged } = await resolveExpiredMarkets(apiKey, supabase);
  console.log(`[cycle] Resolution: ${resolved} resolved, ${flagged} flagged for review`);

  // Step 3: Fix stale dates and curate homepage
  const datesFixed = await fixStaleDates(supabase);
  const featuredUpdated = await curateHomepage(apiKey, supabase);

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

  // Step 6b: Create DeSo profiles for pending creators
  const { created: desoCreated, failed: desoFailed } =
    await processPendingDesoCreations(supabase, 10);
  console.log(`[cycle] DeSo profiles: ${desoCreated} created, ${desoFailed} failed`);

  // Step 7: Weekly tasks (Mondays only)
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday
  let profilesAudited = 0;
  let profilesRemoved = 0;
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

    // Audit and fix fan-account contamination (reserved profiles check)
    const { fixed: auditFixed, removed: auditRemoved } =
      await auditAndFixReservedProfiles(supabase, 100);
    profilesAudited = auditFixed;
    profilesRemoved = auditRemoved;
    console.log(`[cycle] Profile audit: ${auditFixed} confirmed, ${auditRemoved} fan accounts removed`);
  }

  return {
    dupes_deleted: dupesDeleted,
    creator_slugs_backfilled: backfilled,
    markets_resolved: resolved,
    markets_flagged: flagged,
    dates_fixed: datesFixed,
    featured_updated: featuredUpdated,
    auto_voided: autoVoided,
    auto_claimed: autoClaimed,
    deso_profiles_created: desoCreated,
    profiles_audited: profilesAudited,
    fan_accounts_removed: profilesRemoved,
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
