import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

// All prefixes to sweep — covers a-z and 0-9
const ALL_PREFIXES = [
  "a","b","c","d","e","f","g","h","i","j","k","l","m",
  "n","o","p","q","r","s","t","u","v","w","x","y","z",
  "0","1","2","3","4","5","6","7","8","9"
];

async function getDesoPriceUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
    if (!res.ok) return 5;
    const data = await res.json();
    const cents = data?.USDCentsPerDeSoExchangeRate ?? 0;
    return cents > 0 ? cents / 100 : 5;
  } catch { return 5; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProfilesForPrefix(
  prefix: string,
  desoPriceUsd: number,
  minHolders: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  try {
    const res = await fetch("https://node.deso.org/api/v0/get-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        NumToFetch: 100,
        OrderBy: "influencer_coin_price",
        NoErrorOnMissing: true,
        UsernamePrefix: prefix,
      }),
    });

    if (!res.ok) {
      console.warn(`[bulk-import] DeSo error for prefix "${prefix}": ${res.status}`);
      return { imported: 0, skipped: 0 };
    }

    const data = await res.json();
    const profiles: Record<string, unknown>[] = data.ProfilesFound ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, any>[] = [];
    for (const p of profiles) {
      const username = p.Username as string;
      if (!username) { skipped++; continue; }

      const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
      const coinEntry = p.CoinEntry as Record<string, unknown> | undefined;
      const holders = (coinEntry?.NumberOfHolders as number) || 0;

      // Skip ghosts
      if (coinPriceNanos === 0 && holders === 0) { skipped++; continue; }

      // Apply minHolders filter
      if (holders < minHolders) { skipped++; continue; }

      const coinPriceUSD = (coinPriceNanos / 1e9) * desoPriceUsd;
      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const publicKey = p.PublicKeyBase58Check as string;
      const coinsNanos = (coinEntry?.CoinsInCirculationNanos as number) || 0;
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

    if (rows.length > 0) {
      const { error } = await supabase
        .from("creators")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });
      if (error) {
        console.warn(`[bulk-import] Upsert error for prefix "${prefix}":`, error.message);
        skipped += rows.length;
      } else {
        imported += rows.length;
      }
    }
  } catch (err) {
    console.warn(`[bulk-import] Error for prefix "${prefix}":`, err);
  }

  return { imported, skipped };
}

export async function POST(req: NextRequest) {
  try {
    const {
      prefixes,
      minHolders = 2,
      adminPassword,
      desoPublicKey,
    } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Default to first 5 letters if no prefixes specified
    const toProcess: string[] = Array.isArray(prefixes) && prefixes.length > 0
      ? prefixes
      : ["a", "b", "c", "d", "e"];

    const desoPriceUsd = await getDesoPriceUsd();
    const supabase = await createClient();
    const startTime = Date.now();

    let totalImported = 0;
    let totalSkipped = 0;
    const completedPrefixes: string[] = [];

    console.log(`[bulk-import] Live DESO price: $${desoPriceUsd}, sweeping prefixes: ${toProcess.join(", ")}`);

    for (const prefix of toProcess) {
      // Stop if approaching 50s Vercel timeout
      if (Date.now() - startTime > 45000) {
        console.log("[bulk-import] Stopping early — timeout approaching");
        break;
      }

      const { imported, skipped } = await fetchProfilesForPrefix(
        prefix, desoPriceUsd, minHolders, supabase
      );
      totalImported += imported;
      totalSkipped += skipped;
      completedPrefixes.push(prefix);
      console.log(`[bulk-import] Prefix "${prefix}": +${imported} imported, ${skipped} skipped`);
    }

    // Calculate which prefixes remain from the full sweep set
    const completedSet = new Set(completedPrefixes);
    const remainingPrefixes = ALL_PREFIXES.filter(p => !completedSet.has(p));

    return NextResponse.json({
      data: {
        totalImported,
        totalSkipped,
        completedPrefixes,
        desoPriceUsd,
        remainingPrefixes,
        nextBatch: remainingPrefixes.slice(0, 5),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
