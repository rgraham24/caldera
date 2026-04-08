import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

async function getDesoPriceUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
    if (!res.ok) return 5;
    const data = await res.json();
    // USDCentsPerDeSoExchangeRate is in cents — divide by 100
    const cents = data?.USDCentsPerDeSoExchangeRate ?? 0;
    if (cents > 0) return cents / 100;
    // Fallback to reserve price
    const reserveCents = data?.USDCentsPerDeSoReserveExchangeRate ?? 500;
    return reserveCents / 100;
  } catch {
    return 5;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      skip = 0,
      limit = 500,
      minHolders = 2,
      desoPublicKey,
      adminPassword,
    } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const skipN = Math.max(0, Number(skip));
    const limitN = Math.min(Math.max(1, Number(limit)), 1000);
    // Fetch enough profiles from DeSo to cover the skip offset + our limit
    const numToFetch = Math.min(skipN + limitN, 2000);

    const supabase = await createClient();
    const desoPriceUsd = await getDesoPriceUsd();
    console.log(`[bulk-import] Live DESO price: $${desoPriceUsd}, skip: ${skipN}, limit: ${limitN}`);

    // Single large fetch from DeSo — ordered by coin price descending
    const profilesRes = await fetch("https://node.deso.org/api/v0/get-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        NumToFetch: numToFetch,
        OrderBy: "influencer_coin_price",
        NoErrorOnMissing: true,
      }),
    });

    if (!profilesRes.ok) throw new Error(`DeSo API error: ${profilesRes.status}`);

    const profilesData = await profilesRes.json();
    const allProfiles: Record<string, unknown>[] = profilesData.ProfilesFound ?? [];

    // Apply skip offset to get our window
    const batch = allProfiles.slice(skipN, skipN + limitN);
    console.log(`[bulk-import] DeSo returned ${allProfiles.length} profiles, processing ${batch.length} (skip ${skipN})`);

    let totalImported = 0;
    let totalSkipped = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, any>[] = [];

    for (const p of batch) {
      const username = p.Username as string;
      if (!username) { totalSkipped++; continue; }

      const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
      const holders = ((p.CoinEntry as Record<string, unknown>)?.NumberOfHolders as number) || 0;

      // Skip zero-value ghost profiles
      if (coinPriceNanos === 0 && holders === 0) { totalSkipped++; continue; }

      // Apply minHolders filter
      if (holders < minHolders) { totalSkipped++; continue; }

      const coinPriceUSD = (coinPriceNanos / 1e9) * desoPriceUsd;
      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const publicKey = p.PublicKeyBase58Check as string;
      const coinsNanos = ((p.CoinEntry as Record<string, unknown>)?.CoinsInCirculationNanos as number) || 0;
      const tokenStatus = holders > 10 && coinPriceUSD > 2 ? "active_unverified" : "shadow";

      rows.push({
        name: username,
        slug,
        deso_username: username,
        deso_public_key: publicKey,
        image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
        creator_coin_price: coinPriceUSD,
        creator_coin_holders: holders,
        creator_coin_market_cap: (coinsNanos / 1e9) * coinPriceUSD,
        creator_coin_symbol: username.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20),
        token_status: tokenStatus,
        estimated_followers: holders * 100,
      });
    }

    // Single batch upsert
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("creators")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });

      if (error) {
        console.warn("[bulk-import] Batch upsert error:", error.message);
        totalSkipped += rows.length;
      } else {
        totalImported += rows.length;
      }
    }

    const nextSkip = skipN + limitN;
    const hasMore = allProfiles.length >= numToFetch;

    return NextResponse.json({
      data: {
        totalImported,
        totalSkipped,
        processed: batch.length,
        nextSkip: hasMore ? nextSkip : null,
        desoPriceUsd,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
