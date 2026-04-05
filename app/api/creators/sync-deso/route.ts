import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreatorCoinData } from "@/lib/deso/api";

export async function POST() {
  const supabase = await createClient();

  const { data: creators } = await supabase
    .from("creators")
    .select("id, slug, deso_username")
    .not("deso_username", "is", null);

  if (!creators || creators.length === 0) {
    return NextResponse.json({ data: { synced: 0 } });
  }

  let synced = 0;
  for (const creator of creators) {
    try {
      const coinData = await getCreatorCoinData(creator.deso_username!);
      await supabase
        .from("creators")
        .update({
          creator_coin_price: Math.round(coinData.priceUSD * 100) / 100,
          creator_coin_holders: coinData.holders,
          total_coins_in_circulation: coinData.coinsInCirculation,
          deso_public_key: coinData.publicKey,
          profile_pic_url: coinData.profilePicUrl,
          coin_data_updated_at: new Date().toISOString(),
        })
        .eq("id", creator.id);
      synced++;
    } catch {
      // Skip failed creators
    }
  }

  return NextResponse.json({ data: { synced, total: creators.length } });
}
