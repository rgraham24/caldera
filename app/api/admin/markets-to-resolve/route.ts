import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("markets")
    .select("id, title, category, creator_slug, yes_price, total_volume, resolve_at")
    .eq("status", "open")
    .lt("resolve_at", new Date().toISOString())
    .is("resolution_outcome", null)
    .order("resolve_at", { ascending: true })
    .limit(50);

  return NextResponse.json({ markets: data ?? [] });
}
