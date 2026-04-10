import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const supabase = await createClient();
  const { code } = await params;

  // Look up the claim code
  const { data: claimData } = await supabase
    .from("claim_codes")
    .select("code, slug, status")
    .eq("code", code)
    .maybeSingle();

  if (!claimData) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  const claim = claimData as { code: string; slug: string; status: string };

  if (claim.status === "claimed") {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  // Get creator info
  const { data: creatorData } = await supabase
    .from("creators")
    .select("name, slug, creator_coin_symbol, markets_count, total_volume")
    .eq("slug", claim.slug)
    .maybeSingle();

  if (!creatorData) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  const creator = creatorData as {
    name: string;
    slug: string;
    creator_coin_symbol: string;
    markets_count: number;
    total_volume: number;
  };

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
