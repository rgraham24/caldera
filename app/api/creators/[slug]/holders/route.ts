import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTopHolders, getDesoPrice } from "@/lib/deso/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("deso_public_key, total_coins_in_circulation, creator_coin_price")
    .eq("slug", slug)
    .single();

  if (!creator?.deso_public_key) {
    return NextResponse.json({ data: [] });
  }

  try {
    const [holders, desoPrice] = await Promise.all([
      getTopHolders(creator.deso_public_key, creator.total_coins_in_circulation),
      getDesoPrice(),
    ]);

    const withUSD = holders.map((h) => ({
      ...h,
      valueUSD: h.balanceCoins * (creator.creator_coin_price || 0),
    }));

    return NextResponse.json({ data: withUSD });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
