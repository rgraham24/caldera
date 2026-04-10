import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
const DESO_API = "https://api.deso.org/api/v0";
const BATCH_SIZE = 20; // DeSo API max per page

async function getDesoPriceUsd(): Promise<number> {
  try {
    const res = await fetch(`${DESO_API}/get-exchange-rate`);
    const data = await res.json();
    const cents = data?.USDCentsPerDeSoExchangeRate ?? 0;
    return cents > 0 ? cents / 100 : 5;
  } catch { return 5; }
}

export async function POST(req: NextRequest) {
  const { adminPassword, lastPublicKey = "", maxProfiles = 500 } = await req.json();

  if (adminPassword !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const desoPriceUsd = await getDesoPriceUsd();

  let imported = 0;
  let skipped = 0;
  let cursor = lastPublicKey;
  let hasMore = true;
  let lastKey = "";

  while (hasMore && imported + skipped < maxProfiles) {
    const res = await fetch(`${DESO_API}/get-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeyBase58Check: "",
        Username: "",
        UsernamePrefix: "",
        Description: "",
        OrderBy: "influencer_coin_price",
        NumToFetch: BATCH_SIZE,
        ReaderPublicKeyBase58Check: "",
        ModerationType: "",
        FetchUsersThatHODL: false,
        AddGlobalFeedBool: false,
        LastPublicKeyBase58Check: cursor,
      }),
    });

    if (!res.ok) break;
    const data = await res.json();
    const profiles = data?.ProfilesFound ?? [];

    if (profiles.length === 0) { hasMore = false; break; }

    const rows = [];
    for (const p of profiles) {
      const username = p.Username as string;
      if (!username) { skipped++; continue; }

      const isReserved = p.IsReserved === true;
      const coinEntry = p.CoinEntry ?? {};
      const holders = coinEntry.NumberOfHolders ?? 0;
      const coinPriceNanos = p.CoinPriceDeSoNanos ?? 0;

      // Only import reserved profiles OR ones with real holders
      if (!isReserved && holders < 10) { skipped++; continue; }

      const coinPriceUSD = (coinPriceNanos / 1e9) * desoPriceUsd;
      const coinsNanos = coinEntry.CoinsInCirculationNanos ?? 0;
      const publicKey = p.PublicKeyBase58Check as string;
      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      rows.push({
        name: p.Description ? username : username,
        slug,
        deso_username: username,
        deso_public_key: publicKey,
        image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
        creator_coin_price: coinPriceUSD,
        creator_coin_holders: holders,
        creator_coin_market_cap: (coinsNanos / 1e9) * coinPriceUSD,
        creator_coin_symbol: username.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20),
        token_status: isReserved ? "active_unverified" : holders > 100 ? "active_unverified" : "shadow",
        is_reserved: isReserved,
        bio: (p.Description as string) ?? null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("creators")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });
      if (!error) imported += rows.length;
      else skipped += rows.length;
    }

    lastKey = profiles[profiles.length - 1]?.PublicKeyBase58Check ?? "";
    cursor = lastKey;
    hasMore = profiles.length === BATCH_SIZE;

    // Small delay to be nice to DeSo API
    await new Promise(r => setTimeout(r, 200));
  }

  return NextResponse.json({
    data: { imported, skipped, hasMore, lastPublicKey: lastKey, desoPriceUsd }
  });
}
