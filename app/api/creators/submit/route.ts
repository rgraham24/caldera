import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreatorCoinData } from "@/lib/deso/api";

export async function POST(req: NextRequest) {
  try {
    const { desoUsername, category } = await req.json();
    if (!desoUsername) {
      return NextResponse.json({ error: "DeSo username required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if already exists
    const { data: existing } = await supabase
      .from("creators")
      .select("id")
      .eq("deso_username", desoUsername)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Creator already exists on Caldera" }, { status: 400 });
    }

    // Verify on DeSo
    let coinData;
    try {
      coinData = await getCreatorCoinData(desoUsername);
    } catch {
      return NextResponse.json({ error: "DeSo username not found" }, { status: 404 });
    }

    const slug = desoUsername.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    await supabase.from("creators").insert({
      name: coinData.username,
      slug,
      deso_username: coinData.username,
      deso_public_key: coinData.publicKey,
      profile_pic_url: coinData.profilePicUrl,
      creator_coin_symbol: coinData.username.toUpperCase().slice(0, 6),
      creator_coin_price: Math.round(coinData.priceUSD * 100) / 100,
      creator_coin_holders: coinData.holders,
      creator_coin_market_cap: coinData.priceUSD * coinData.coinsInCirculation,
      total_coins_in_circulation: coinData.coinsInCirculation,
      category: category || "viral",
      tier: "unclaimed",
      coin_data_updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ data: { created: true, slug } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
