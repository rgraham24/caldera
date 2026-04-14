import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

const CATEGORY_TOKENS: Record<string, string> = {
  Sports: "caldera-sports",
  Music: "caldera-music",
  Politics: "caldera-politics",
  Entertainment: "caldera-entertainment",
  Companies: "caldera-companies",
  Climate: "caldera-climate",
  Tech: "caldera-tech",
  Creators: "caldera-creators",
  Commentary: "caldera-creators",
  Streamers: "caldera-creators",
  Viral: "caldera-creators",
  Crypto: "caldera-creators",
};

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    category,
    creatorSlug,
    resolveAt,
    yesPrice,
    isBreaking,
    isFeatured,
    adminPassword: pw,
  } = body as {
    title?: string;
    category?: string;
    creatorSlug?: string;
    resolveAt?: string;
    yesPrice?: number;
    isBreaking?: boolean;
    isFeatured?: boolean;
    adminPassword?: string;
  };

  if (pw !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!title || typeof title !== "string" || title.length < 10 || title.length > 120) {
    return NextResponse.json({ error: "Title must be 10-120 characters" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Category required" }, { status: 400 });
  }
  if (!resolveAt) {
    return NextResponse.json({ error: "Resolve date required" }, { status: 400 });
  }

  const yes = typeof yesPrice === "number" ? Math.max(0.1, Math.min(0.9, yesPrice)) : 0.5;
  const no = 1 - yes;

  const baseSlug = slugify(title).slice(0, 80);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const supabase = await createClient();

  // Resolve creator_id if creatorSlug provided
  let creatorId: string | null = null;
  if (creatorSlug) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("slug", creatorSlug)
      .maybeSingle();
    creatorId = creator?.id ?? null;
  }

  const { data: market, error } = await supabase
    .from("markets")
    .insert({
      title: title.trim(),
      slug,
      category,
      creator_id: creatorId,
      creator_slug: creatorSlug ?? null,
      status: "open",
      market_type: "binary",
      resolve_at: resolveAt,
      yes_price: yes,
      no_price: no,
      yes_pool: 500,
      no_pool: 500,
      liquidity: 1000,
      total_volume: 0,
      trending_score: isBreaking ? 1000 : 0,
      featured_score: isFeatured ? 1 : 0,
      category_token_slug: CATEGORY_TOKENS[category] ?? "caldera-creators",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: market });
}
