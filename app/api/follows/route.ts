import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// GET /api/follows?desoPublicKey=X — returns array of slugs the user follows
export async function GET(req: NextRequest) {
  const desoPublicKey = req.nextUrl.searchParams.get("desoPublicKey");
  if (!desoPublicKey) return NextResponse.json({ data: [] });

  const supabase = await createClient();
  const { data, error } = await (supabase as DB)
    .from("follows")
    .select("following_slug")
    .eq("follower_deso_key", desoPublicKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r: DB) => r.following_slug) });
}

// POST /api/follows — { slug, desoPublicKey }
export async function POST(req: NextRequest) {
  const { slug, desoPublicKey } = await req.json();
  if (!slug || !desoPublicKey) return NextResponse.json({ error: "slug and desoPublicKey required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await (supabase as DB)
    .from("follows")
    .upsert(
      { follower_deso_key: desoPublicKey, following_slug: slug },
      { onConflict: "follower_deso_key,following_slug" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { following: true } });
}

// DELETE /api/follows — { slug, desoPublicKey }
export async function DELETE(req: NextRequest) {
  const { slug, desoPublicKey } = await req.json();
  if (!slug || !desoPublicKey) return NextResponse.json({ error: "slug and desoPublicKey required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await (supabase as DB)
    .from("follows")
    .delete()
    .eq("follower_deso_key", desoPublicKey)
    .eq("following_slug", slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { following: false } });
}
