import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const supabase = await createClient();
  const { code } = await params;

  // ── New system: look up by creators.claim_code ────────────────────────────
  const { data: creatorByCode } = await supabase
    .from("creators")
    .select("id, name, slug, creator_coin_symbol, markets_count, total_volume, twitter_handle, claim_code, claim_status, unclaimed_earnings_usd")
    .eq("claim_code", code)
    .maybeSingle();

  if (creatorByCode) {
    if (creatorByCode.claim_status === "claimed") {
      return NextResponse.json({ error: "already_claimed" }, { status: 409 });
    }
    return NextResponse.json({
      creator: {
        name: creatorByCode.name,
        slug: creatorByCode.slug,
        symbol: creatorByCode.creator_coin_symbol ?? creatorByCode.slug.toUpperCase(),
        twitterHandle: creatorByCode.twitter_handle,
        claimCode: code,
        marketsCount: creatorByCode.markets_count ?? 0,
        unclaimedEarnings: Number(creatorByCode.unclaimed_earnings_usd ?? 0),
        total_volume: creatorByCode.total_volume ?? 0,
      },
    });
  }

  // ── Legacy system: look up in claim_codes table ───────────────────────────
  const { data: claim } = await supabase
    .from("claim_codes")
    .select("code, slug, status")
    .eq("code", code)
    .maybeSingle() as { data: { code: string; slug: string; status: string } | null };

  if (!claim) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  if (claim.status === "claimed") {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const { data: creator } = await supabase
    .from("creators")
    .select("name, slug, creator_coin_symbol, markets_count, total_volume, twitter_handle, unclaimed_earnings_usd")
    .eq("slug", claim.slug)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  return NextResponse.json({
    creator: {
      name: creator.name,
      slug: creator.slug,
      symbol: creator.creator_coin_symbol ?? creator.slug.toUpperCase(),
      twitterHandle: creator.twitter_handle,
      claimCode: code,
      marketsCount: creator.markets_count ?? 0,
      unclaimedEarnings: Number(creator.unclaimed_earnings_usd ?? 0),
      total_volume: creator.total_volume ?? 0,
    },
  });
}
