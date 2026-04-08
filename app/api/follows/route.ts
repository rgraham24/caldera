import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

// GET /api/follows?deso_key=xxx — returns slugs this user follows
export async function GET(req: NextRequest) {
  const desoKey = req.nextUrl.searchParams.get("deso_key");
  if (!desoKey) return NextResponse.json({ data: [] });

  const supabase = await createClient();
  const { data, error } = await (supabase as SupabaseAny)
    .from("follows")
    .select("following_slug")
    .eq("follower_deso_key", desoKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r: SupabaseAny) => r.following_slug) });
}

// POST /api/follows — { deso_key, slug }
export async function POST(req: NextRequest) {
  const { deso_key, slug } = await req.json();
  if (!deso_key || !slug) return NextResponse.json({ error: "deso_key and slug required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await (supabase as SupabaseAny)
    .from("follows")
    .upsert({ follower_deso_key: deso_key, following_slug: slug }, { onConflict: "follower_deso_key,following_slug" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { followed: true } });
}

// DELETE /api/follows — { deso_key, slug }
export async function DELETE(req: NextRequest) {
  const { deso_key, slug } = await req.json();
  if (!deso_key || !slug) return NextResponse.json({ error: "deso_key and slug required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await (supabase as SupabaseAny)
    .from("follows")
    .delete()
    .eq("follower_deso_key", deso_key)
    .eq("following_slug", slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { unfollowed: true } });
}
