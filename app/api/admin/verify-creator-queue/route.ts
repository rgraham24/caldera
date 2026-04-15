import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Category tokens and well-known non-person slugs — never show in queue
const EXCLUDED_SLUGS = [
  "creators", "caldera-creators",
  "sports", "caldera-sports",
  "entertainment", "caldera-entertainment",
  "music", "caldera-music",
  "politics", "caldera-politics",
  "tech", "caldera-tech",
  "companies", "caldera-companies",
  "climate", "caldera-climate",
  "crypto",
  "nba", "nfl", "ufc", "f1", "mlb", "nhl",
  "lakers", "chiefs", "yankees", "celtics",
];

/**
 * GET /api/admin/verify-creator-queue
 *
 * Before returning the queue, runs two self-healing cleanup passes:
 *
 * 1. Creators that already have a deso_public_key but are still marked
 *    pending_deso_creation or shadow → flip to active_unverified / approved.
 *    (These are reserved DeSo profiles — the coin already exists.)
 *
 * 2. Category slugs that ended up in the creators table with wrong statuses
 *    → flip to active_unverified so they stop appearing as pending.
 *
 * Queue filter: token_status = 'pending_deso_creation' AND deso_public_key IS NULL
 * (i.e., real creators whose DeSo coin still needs to be created by admin)
 */
export async function GET() {
  const supabase = createServiceClient();

  // ── Cleanup pass 1: reserved profiles with a DeSo key ──────────────────────
  console.log("[verify-queue] Running cleanup pass 1: reserved profiles with wrong token_status");
  const { error: cleanup1Error, count: cleanup1Count } = await supabase
    .from("creators")
    .update({ token_status: "active_unverified", verification_status: "approved" })
    .not("deso_public_key", "is", null)
    .neq("deso_public_key", "")
    .in("token_status", ["pending_deso_creation", "shadow"]);
  if (cleanup1Error) {
    console.error("[verify-queue] Cleanup pass 1 error:", cleanup1Error);
  } else {
    console.log("[verify-queue] Cleanup pass 1 done, rows affected:", cleanup1Count ?? "unknown");
  }

  // ── Cleanup pass 2: category slugs with wrong status ───────────────────────
  console.log("[verify-queue] Running cleanup pass 2: category slugs");
  const { error: cleanup2Error, count: cleanup2Count } = await supabase
    .from("creators")
    .update({ token_status: "active_unverified" })
    .in("slug", EXCLUDED_SLUGS);
  if (cleanup2Error) {
    console.error("[verify-queue] Cleanup pass 2 error:", cleanup2Error);
  } else {
    console.log("[verify-queue] Cleanup pass 2 done, rows affected:", cleanup2Count ?? "unknown");
  }

  // ── Build queue ─────────────────────────────────────────────────────────────
  // Only creators with NO deso_public_key and token_status = 'pending_deso_creation'
  // (shadow + pending_review without a key are also included so they don't get lost)
  const { data: creators } = await supabase
    .from("creators")
    .select("id, slug, name, image_url, category, token_status, verification_status, twitter_handle, markets_count, deso_public_key")
    .or("token_status.eq.pending_deso_creation,and(token_status.eq.shadow,verification_status.eq.pending_review)")
    .is("deso_public_key", null)
    .not("verification_status", "in", '("approved","rejected")')
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(100);

  if (!creators?.length) {
    return NextResponse.json({ queue: [] });
  }

  // Filter out category slugs / excluded identifiers
  const filtered = creators.filter((c) => !EXCLUDED_SLUGS.includes(c.slug));

  if (!filtered.length) {
    return NextResponse.json({ queue: [] });
  }

  // Get total volume per creator
  const slugs = filtered.map((c) => c.slug);
  const { data: volumeData } = await supabase
    .from("markets")
    .select("creator_slug, total_volume")
    .in("creator_slug", slugs)
    .eq("status", "open");

  const volumeBySlug: Record<string, number> = {};
  for (const m of volumeData ?? []) {
    if (!m.creator_slug) continue;
    volumeBySlug[m.creator_slug] = (volumeBySlug[m.creator_slug] ?? 0) + (m.total_volume ?? 0);
  }

  const queue = filtered.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    image_url: c.image_url,
    category: c.category,
    token_status: c.token_status,
    verification_status: c.verification_status,
    twitter_handle: c.twitter_handle,
    markets_count: c.markets_count ?? 0,
    total_volume: volumeBySlug[c.slug] ?? 0,
    deso_public_key: c.deso_public_key ?? null,
  }));

  return NextResponse.json({ queue });
}
