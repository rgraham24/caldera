import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const supabase = await createClient();
  const { code } = await params;

  const { data: claimRaw } = await supabase
    .from("claim_codes")
    .select("code, slug, status")
    .eq("code", code)
    .maybeSingle();

  if (!claimRaw) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claim = claimRaw as any;

  if (claim.status === "claimed") {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const { data: creatorRaw } = await supabase
    .from("creators")
    .select("name, slug, creator_coin_symbol, markets_count, total_volume")
    .eq("slug", claim.slug)
    .maybeSingle();

  if (!creatorRaw) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = creatorRaw as any;

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
