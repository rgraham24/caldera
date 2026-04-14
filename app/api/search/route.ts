import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ creators: [], markets: [] });
  }

  const supabase = await createClient();

  const [creatorsRes, marketsRes] = await Promise.all([
    supabase
      .from("creators")
      .select("id, slug, name, image_url, creator_coin_symbol")
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
      .not("entity_type", "eq", "category")
      .limit(5),
    supabase
      .from("markets")
      .select("id, slug, title, category, yes_price")
      .ilike("title", `%${q}%`)
      .eq("status", "open")
      .order("trending_score", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    creators: creatorsRes.data ?? [],
    markets: marketsRes.data ?? [],
  });
}
