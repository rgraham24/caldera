import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_KEYS = [
  "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
];
const DESO_PRICE_USD = 5.25;

export async function POST(req: NextRequest) {
  try {
    const { count = 100, cursor, desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const numToFetch = Math.min(Math.max(1, Number(count)), 1000);

    const desoBody: Record<string, unknown> = {
      NumToFetch: numToFetch,
      OrderBy: "influencer_coin_price",
      NoErrorOnMissing: true,
    };
    if (cursor) desoBody.LastPublicKeyBase58Check = cursor;

    const profilesRes = await fetch("https://node.deso.org/api/v0/get-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(desoBody),
    });

    if (!profilesRes.ok) {
      return NextResponse.json({ error: "Failed to fetch DeSo profiles" }, { status: 500 });
    }

    const profilesData = await profilesRes.json();
    const profiles: Record<string, unknown>[] = profilesData.ProfilesFound ?? [];

    const supabase = await createClient();
    let imported = 0;
    let skipped = 0;

    for (const p of profiles) {
      const username = p.Username as string;
      if (!username) { skipped++; continue; }

      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const publicKey = p.PublicKeyBase58Check as string;
      const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
      const coinPriceUSD = (coinPriceNanos / 1e9) * DESO_PRICE_USD;
      const holders = ((p.CoinEntry as Record<string, unknown>)?.NumberOfHolders as number) || 0;
      const coinsNanos = ((p.CoinEntry as Record<string, unknown>)?.CoinsInCirculationNanos as number) || 0;
      const coinsInCirculation = coinsNanos / 1e9;
      const profilePicUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`;

      const { error } = await supabase
        .from("creators")
        .upsert(
          {
            name: username,
            slug,
            deso_username: username,
            deso_public_key: publicKey,
            image_url: profilePicUrl,
            creator_coin_price: coinPriceUSD,
            creator_coin_holders: holders,
            creator_coin_market_cap: coinsInCirculation * coinPriceUSD,
          },
          { onConflict: "slug", ignoreDuplicates: false }
        );

      if (error) { skipped++; } else { imported++; }
    }

    const lastProfile = profiles[profiles.length - 1];
    const nextCursor = lastProfile
      ? (lastProfile.PublicKeyBase58Check as string) ?? null
      : null;

    return NextResponse.json({
      data: { imported, skipped, total: profiles.length, nextCursor },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
