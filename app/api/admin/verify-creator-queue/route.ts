import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/verify-creator-queue
 * Returns creators pending admin verification:
 * - token_status = 'pending_deso_creation' (legacy)
 * - OR verification_status = 'pending_review'
 * - AND verification_status NOT IN ('approved', 'rejected')
 * - AND have at least 1 market
 */
export async function GET() {
  const supabase = createServiceClient();

  // Fetch candidate creators:
  //   - legacy: token_status = 'pending_deso_creation'
  //   - new pipeline: token_status = 'shadow' with verification_status = 'pending_review'
  //   - explicit queue: verification_status = 'pending_review'
  // Exclude already resolved (approved/rejected)
  const { data: creators } = await supabase
    .from("creators")
    .select("id, slug, name, image_url, category, token_status, verification_status, twitter_handle, markets_count")
    .or("token_status.eq.pending_deso_creation,token_status.eq.shadow,verification_status.eq.pending_review")
    .not("verification_status", "in", '("approved","rejected")')
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(100);

  if (!creators?.length) {
    return NextResponse.json({ queue: [] });
  }

  // Get total volume per creator
  const slugs = creators.map((c) => c.slug);
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

  const queue = creators.map((c) => ({
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
  }));

  return NextResponse.json({ queue });
}
