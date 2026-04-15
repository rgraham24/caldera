import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  try {
    const supabase = await createClient();

    // Look up user_id from deso_public_key
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("deso_public_key", publicKey)
      .single();

    if (!userRow) return NextResponse.json({ holdings: [] });

    // Get coins purchased through Caldera, joining creators for slug
    const { data: purchases } = await supabase
      .from("user_coin_purchases")
      .select("deso_username, coins_purchased, price_per_coin_usd, creator:creators(slug, deso_username)")
      .eq("user_id", userRow.id)
      .order("purchased_at", { ascending: false });

    if (!purchases?.length) return NextResponse.json({ holdings: [] });

    // Aggregate by creator (sum coins across multiple purchases)
    const aggregated = new Map<string, {
      creatorSlug: string;
      desoUsername: string;
      totalCoins: number;
      avgPriceUSD: number;
    }>();

    for (const p of purchases) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creator = p.creator as any;
      const username = creator?.deso_username ?? p.deso_username ?? "";
      const slug = creator?.slug ?? "";
      const key = slug || username;
      if (!key) continue;
      const existing = aggregated.get(key);
      if (existing) {
        existing.totalCoins += p.coins_purchased ?? 0;
      } else {
        aggregated.set(key, {
          creatorSlug: slug,
          desoUsername: username,
          totalCoins: p.coins_purchased ?? 0,
          avgPriceUSD: p.price_per_coin_usd ?? 0,
        });
      }
    }

    // Fetch live prices + profile data from DeSo for each creator
    const desoUsernames = [...aggregated.values()]
      .map(v => v.desoUsername)
      .filter(Boolean);

    const [priceRes, ...profileResults] = await Promise.all([
      fetch("https://api.deso.org/api/v0/get-exchange-rate"),
      ...desoUsernames.map(username =>
        fetch("https://api.deso.org/api/v0/get-single-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Username: username }),
        }).then(r => r.json()).catch(() => null)
      ),
    ]);

    const priceData = await priceRes.json();
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;

    // Build profile map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>();
    desoUsernames.forEach((username, i) => {
      const profile = profileResults[i]?.Profile;
      if (profile) profileMap.set(username, profile);
    });

    const holdings = [...aggregated.values()].map(v => {
      const profile = profileMap.get(v.desoUsername);
      const coinPriceDeSo = (profile?.CoinPriceDeSoNanos ?? 0) / 1e9;
      const coinPriceUSD = coinPriceDeSo * desoUSD;
      const pk = profile?.PublicKeyBase58Check ?? "";

      return {
        creatorPublicKey: pk,
        username: v.desoUsername,
        displayName: profile?.ExtraData?.DisplayName ?? profile?.Username ?? v.desoUsername,
        imageUrl: pk ? `https://node.deso.org/api/v0/get-single-profile-picture/${pk}` : null,
        balanceNanos: Math.floor(v.totalCoins * 1e9),
        coinPriceUSD,
        hasPurchased: true,
        creatorSlug: v.creatorSlug,
        totalValueUSD: v.totalCoins * coinPriceUSD,
      };
    }).filter(h => h.balanceNanos > 0);

    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ holdings: [] });
  }
}
