import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("creators")
    .select("id, slug, name, creator_coin_symbol, markets_count, image_url")
    .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: data ?? [] });
}
