// GET only. Phase 5d-2 deleted the POST handler — admin market creation
// flows through /api/markets/admin-create, which validates the creator and
// always sets creator_id/creator_slug. The orphan-market hole this POST
// produced is now closed.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const category = searchParams.get("category");
  const status = searchParams.get("status") ?? "open";
  const sort = searchParams.get("sort") || "trending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const desoPublicKey = searchParams.get("desoPublicKey");
  const creatorSlug = searchParams.get("creatorSlug");

  // Creator feed: fetch markets for a specific creator by slug.
  // Phase 3 defense-in-depth — becomes redundant after Phase 4 cleans data.
  if (creatorSlug) {
    const { data: creatorRow } = await supabase
      .from("creators")
      .select("id")
      .eq("slug", creatorSlug)
      .maybeSingle();

    if (!creatorRow) return NextResponse.json({ data: [] });

    const { data, error } = await supabase
      .from("markets")
      .select("*")
      .eq("creator_id", creatorRow.id)
      .order("trending_score", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
    return NextResponse.json({ data: filterVerifiedMarkets(data ?? [], verifiedSlugs) });
  }

  // Following feed: fetch followed slugs → get matching creator names → title-match markets
  if (sort === "following" && desoPublicKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: followRows } = await (supabase as any)
      .from("follows")
      .select("following_slug")
      .eq("follower_deso_key", desoPublicKey);

    const slugs: string[] = (followRows ?? []).map((r: { following_slug: string }) => r.following_slug);

    if (slugs.length === 0) return NextResponse.json({ data: [] });

    // Get creator names for those slugs
    const { data: creators } = await supabase
      .from("creators")
      .select("name, slug")
      .in("slug", slugs);

    const names = (creators ?? []).map((c) => c.name).filter(Boolean);
    if (names.length === 0) return NextResponse.json({ data: [] });

    // Fetch open markets and filter by creator name in title (client-side, small set)
    const { data: allMarkets } = await supabase
      .from("markets")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(500);

    const filtered = (allMarkets ?? []).filter((m) =>
      names.some((name) => m.title.toLowerCase().includes(name.toLowerCase()))
    );

    // Phase 3 defense-in-depth — drop orphan markets attached to unverified creators.
    const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
    const verified = filterVerifiedMarkets(filtered, verifiedSlugs);
    return NextResponse.json({ data: verified.slice(offset, offset + limit) });
  }

  let query = supabase.from("markets").select("*").eq("status", status);

  if (category && category !== "all") query = query.ilike("category", category);

  switch (sort) {
    case "volume":
      query = query.order("total_volume", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "breaking": {
      // Breaking = recently created markets (last 48h) ordered by trending score
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      query = query
        .gte("created_at", fortyEightHoursAgo)
        .order("trending_score", { ascending: false });
      break;
    }
    case "resolving_soon":
      query = query.order("resolve_at", { ascending: true });
      break;
    case "trending":
      query = query.order("trending_score", { ascending: false });
      break;
    default:
      query = query.order("trending_score", { ascending: false });
  }

  // Run data fetch and total count in parallel.
  // Count query mirrors the same status + category filters without ordering.
  let countQuery = supabase
    .from("markets")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (category && category !== "all") countQuery = countQuery.ilike("category", category);
  if (sort === "breaking") {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.gte("created_at", fortyEightHoursAgo);
  }

  const [{ data, error }, { count: total }] = await Promise.all([
    query.range(offset, offset + limit - 1),
    countQuery,
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Phase 3 defense-in-depth — drop markets attached to unverified creators.
  // Becomes redundant after Phase 4 cleans data.
  const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
  const verifiedData = filterVerifiedMarkets(data ?? [], verifiedSlugs);

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const enriched = verifiedData.map((m) => ({
    ...m,
    is_breaking: (m.created_at ?? "") > twoHoursAgo && (m.trending_score ?? 0) > 20,
  }));

  return NextResponse.json({ data: enriched, total: total ?? enriched.length });
}
