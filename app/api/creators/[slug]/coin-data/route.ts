import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreatorCoinData } from "@/lib/deso/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // If no DeSo username, return cached Supabase data
  if (!creator.deso_username) {
    return NextResponse.json({
      data: {
        priceUSD: creator.creator_coin_price,
        holders: creator.creator_coin_holders,
        coinsInCirculation: creator.total_coins_in_circulation,
        profilePicUrl: creator.profile_pic_url,
        desoUsername: null,
        live: false,
        updatedAt: creator.coin_data_updated_at,
      },
    });
  }

  try {
    const coinData = await getCreatorCoinData(creator.deso_username);

    // Update cache in Supabase (fire-and-forget)
    supabase
      .from("creators")
      .update({
        creator_coin_price: Math.round(coinData.priceUSD * 100) / 100,
        creator_coin_holders: coinData.holders,
        total_coins_in_circulation: coinData.coinsInCirculation,
        deso_public_key: coinData.publicKey,
        profile_pic_url: coinData.profilePicUrl,
        coin_data_updated_at: new Date().toISOString(),
      })
      .eq("id", creator.id)
      .then(() => {});

    return NextResponse.json({
      data: {
        priceUSD: Math.round(coinData.priceUSD * 100) / 100,
        holders: coinData.holders,
        coinsInCirculation: coinData.coinsInCirculation,
        profilePicUrl: coinData.profilePicUrl,
        desoUsername: coinData.username,
        live: true,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {
    // Fallback to cached data
    return NextResponse.json({
      data: {
        priceUSD: creator.creator_coin_price,
        holders: creator.creator_coin_holders,
        coinsInCirculation: creator.total_coins_in_circulation,
        profilePicUrl: creator.profile_pic_url,
        desoUsername: creator.deso_username,
        live: false,
        updatedAt: creator.coin_data_updated_at,
      },
    });
  }
}
