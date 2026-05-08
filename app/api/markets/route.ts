import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import {
  fetchVerifiedCreatorSlugs,
  filterVerifiedMarkets,
} from "@/lib/creators/validity";
import { z } from "zod";

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

  // Following feed: source of truth is DeSo's blockchain follow graph.
  // 1) /api/following proxies api.deso.org/get-follows-stateless and
  //    returns the list of public keys this user follows.
  // 2) Map those keys to creator rows via creators.deso_public_key
  //    (populated for all 14k+ active creators).
  // 3) Filter open markets to those creators by creator_id.
  //
  // Local follows table is no longer consulted — it was deleted as
  // part of the DeSo-native follow overhaul.
  if (sort === "following" && desoPublicKey) {
    // Internal call to /api/following so the DeSo-fetch-with-timeout
    // logic stays centralized in one place.
    const baseUrl = req.nextUrl.origin;
    const followRes = await fetch(
      `${baseUrl}/api/following?publicKey=${encodeURIComponent(desoPublicKey)}`
    );
    const { followedKeys = [] } = (await followRes.json()) as { followedKeys: string[] };
    if (followedKeys.length === 0) return NextResponse.json({ data: [] });

    // Map DeSo public keys to creator IDs. DeSo's NumToFetch=500 caps
    // the upstream fetch so the .in() here can never overflow Supabase
    // limits.
    const { data: creators } = await supabase
      .from("creators")
      .select("id")
      .in("deso_public_key", followedKeys);
    const creatorIds = (creators ?? []).map((c) => c.id);
    if (creatorIds.length === 0) return NextResponse.json({ data: [] });

    const { data: rawMarkets } = await supabase
      .from("markets")
      .select("*")
      .in("creator_id", creatorIds)
      .eq("status", "open")
      .order("trending_score", { ascending: false })
      .range(offset, offset + limit - 1);

    // Phase 3 defense-in-depth — drop orphan markets attached to unverified creators.
    const verifiedSlugs = await fetchVerifiedCreatorSlugs(supabase);
    const verified = filterVerifiedMarkets(rawMarkets ?? [], verifiedSlugs);
    return NextResponse.json({ data: verified });
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

const createMarketSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  rulesText: z.string().optional(),
  resolutionSourceUrl: z.string().url().optional(),
  closeAt: z.string().optional(),
  resolveAt: z.string().optional(),
  initialLiquidity: z.number().positive().default(1000),
  featured: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    // ── Auth: cookie-direct verify (F-6 pattern) ─────────────
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
    const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
    if (!cookie || !signingKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let session;
    try {
      session = await verifyCookie(cookie, signingKey);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dbUser } = await (supabase as any)
      .from("users")
      .select("id, is_admin")
      .eq("deso_public_key", session.publicKey)
      .maybeSingle();

    if (!dbUser?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createMarketSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const liquidity = d.initialLiquidity;

    const { data: market, error } = await supabase
      .from("markets")
      .insert({
        title: d.title,
        slug: d.slug,
        description: d.description,
        category: d.category,
        subcategory: d.subcategory,
        rules_text: d.rulesText,
        resolution_source_url: d.resolutionSourceUrl,
        close_at: d.closeAt,
        resolve_at: d.resolveAt,
        created_by_user_id: dbUser.id,
        liquidity,
        yes_pool: liquidity,
        no_pool: liquidity,
        yes_price: 0.5,
        no_price: 0.5,
        featured_score: d.featured ? 5 : 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: market }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
