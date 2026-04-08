import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

const PAGE_SIZE = 50;

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
    return 5; // conservative fallback — close to current real price
  }
}

async function fetchAndInsertPage(
  cursor: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>,
  desoPriceUsd: number,
  minHolders: number
): Promise<{ imported: number; skipped: number; nextCursor: string | null }> {
  const body: Record<string, unknown> = {
    NumToFetch: PAGE_SIZE,
    OrderBy: "influencer_coin_price",
    NoErrorOnMissing: true,
  };
  if (cursor) body.LastPublicKeyBase58Check = cursor;

  const profilesRes = await fetch("https://node.deso.org/api/v0/get-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!profilesRes.ok) throw new Error(`DeSo API error: ${profilesRes.status}`);

  const profilesData = await profilesRes.json();
  const profiles: Record<string, unknown>[] = profilesData.ProfilesFound ?? [];

  let imported = 0;
  let skipped = 0;

  // Collect valid rows first, then batch upsert — much faster than one-by-one
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];

  for (const p of profiles) {
    const username = p.Username as string;
    if (!username) { skipped++; continue; }

    const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
    const holders = ((p.CoinEntry as Record<string, unknown>)?.NumberOfHolders as number) || 0;

    // Skip zero-value ghost profiles
    if (coinPriceNanos === 0 && holders === 0) { skipped++; continue; }

    // Apply minHolders filter
    if (holders < minHolders) { skipped++; continue; }

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

  // Single batch upsert — one round-trip instead of up to 50
  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("creators")
      .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });

    if (error) {
      console.warn("[bulk-import] Batch upsert error:", error.message);
      skipped += rows.length;
    } else {
      imported += rows.length;
    }
  }

  const lastProfile = profiles[profiles.length - 1];
  const nextCursor = lastProfile
    ? ((lastProfile.PublicKeyBase58Check as string) ?? null)
    : null;

  return { imported, skipped, nextCursor };
}

export async function POST(req: NextRequest) {
  try {
    const { pages = 10, startCursor, desoPublicKey, adminPassword, minHolders = 0 } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const numPages = Math.min(Math.max(1, Number(pages)), 20);
    const supabase = await createClient();

    const DESO_PRICE_USD = await getDesoPriceUsd();
    console.log(`[bulk-import] Live DESO price: $${DESO_PRICE_USD}`);

    let totalImported = 0;
    let totalSkipped = 0;
    let cursor: string | null = startCursor ?? null;
    let completedPages = 0;

    const startTime = Date.now();
    while (completedPages < numPages) {
      // Stop if approaching 45 seconds to stay within Vercel's 60s timeout
      if (Date.now() - startTime > 45000) {
        console.log("[bulk-import] Stopping early to avoid timeout");
        break;
      }

      const { imported, skipped, nextCursor } = await fetchAndInsertPage(cursor, supabase, DESO_PRICE_USD, minHolders);
      totalImported += imported;
      totalSkipped += skipped;
      completedPages++;
      cursor = nextCursor;

      if (!nextCursor) break;
    }

    return NextResponse.json({
      data: {
        totalImported,
        totalSkipped,
        pages: completedPages,
        nextCursor: cursor,
        desoPriceUsd: DESO_PRICE_USD,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
