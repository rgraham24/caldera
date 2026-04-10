import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const supabase = await createClient();
  const { code } = await params;

  // Look up the claim code
  const { data: claim } = await supabase
    .from("claim_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  if (claim.status === "claimed") {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  // Get creator info
  const { data: creator } = await supabase
    .from("creators")
    .select("name, slug, creator_coin_symbol, markets_count, total_volume")
    .eq("slug", claim.slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  return NextResponse.json({
    creator: {
      name: creator.name,
      slug: creator.slug,
      symbol: creator.creator_coin_symbol,
      markets_count: creator.markets_count ?? 0,
      total_volume: creator.total_volume ?? 0,
    },
  });
}
