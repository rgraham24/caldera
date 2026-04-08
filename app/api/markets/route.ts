import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const category = searchParams.get("category");
  const status = searchParams.get("status") ?? "open";
  const sort = searchParams.get("sort") || "newest";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const desoPublicKey = searchParams.get("desoPublicKey");

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

    return NextResponse.json({ data: filtered.slice(offset, offset + limit) });
  }

  let query = supabase.from("markets").select("*").eq("status", status);

  if (category && category !== "all") query = query.eq("category", category);

  switch (sort) {
    case "volume":
      query = query.order("total_volume", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "resolving_soon":
      query = query.order("resolve_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
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
    const supabase = await createClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin
    const { data: dbUser } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", authUser.id)
      .single();

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
        created_by_user_id: authUser.id,
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
