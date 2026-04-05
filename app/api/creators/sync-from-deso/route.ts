import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTopProfiles, getDesoPrice } from "@/lib/deso/api";

export async function GET() {
  try {
    const supabase = await createClient();
    const [profiles, desoPrice] = await Promise.all([
      getTopProfiles(100),
      getDesoPrice(),
    ]);

    let synced = 0;

    for (const p of profiles) {
      const username = p.Username;
      if (!username) continue;

      const coinPriceNanos = p.CoinPriceDeSoNanos || 0;
      const coinPriceUSD = (coinPriceNanos / 1e9) * desoPrice;
      if (coinPriceUSD < 1) continue;

      const holders = p.CoinEntry?.NumberOfHolders || 0;
      const coinsNanos = p.CoinEntry?.CoinsInCirculationNanos || 0;
      const coinsInCirculation = coinsNanos / 1e9;
      const marketCap = coinsInCirculation * coinPriceUSD;
      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const publicKey = p.PublicKeyBase58Check;
      const bio = (p.Description || "").slice(0, 200) || null;
      const picUrl = `https://diamondapp.com/api/v0/get-single-profile-picture/${publicKey}`;

      // Check if exists
      const { data: existing } = await supabase
        .from("creators")
        .select("id, tier")
        .eq("deso_username", username)
        .single();

      const now = new Date().toISOString();

      if (existing) {
        await supabase
          .from("creators")
          .update({
            creator_coin_price: Math.round(coinPriceUSD * 100) / 100,
            creator_coin_holders: holders,
            creator_coin_market_cap: Math.round(marketCap),
            total_coins_in_circulation: coinsInCirculation,
            deso_public_key: publicKey,
            profile_pic_url: picUrl,
            coin_data_updated_at: now,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("creators").insert({
          name: username,
          slug,
          deso_username: username,
          deso_public_key: publicKey,
          profile_pic_url: picUrl,
          creator_coin_symbol: username.toUpperCase().slice(0, 8),
          creator_coin_price: Math.round(coinPriceUSD * 100) / 100,
          creator_coin_holders: holders,
          creator_coin_market_cap: Math.round(marketCap),
          total_coins_in_circulation: coinsInCirculation,
          category: "viral",
          tier: "unclaimed",
          coin_data_updated_at: now,
        });
      }
      synced++;
    }

    return NextResponse.json({ data: { synced, total: profiles.length } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
