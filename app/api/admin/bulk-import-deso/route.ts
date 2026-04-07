import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

const DESO_PRICE_USD = 5.25;
const PAGE_SIZE = 100;

async function fetchAndInsertPage(
  cursor: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>
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

    const { error } = await supabase.from("creators").upsert(
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
    ? ((lastProfile.PublicKeyBase58Check as string) ?? null)
    : null;

  return { imported, skipped, nextCursor };
}

export async function POST(req: NextRequest) {
  try {
    const { pages = 10, startCursor, desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const numPages = Math.min(Math.max(1, Number(pages)), 50);
    const supabase = await createClient();

    let totalImported = 0;
    let totalSkipped = 0;
    let cursor: string | null = startCursor ?? null;
    let completedPages = 0;

    for (let i = 0; i < numPages; i++) {
      const { imported, skipped, nextCursor } = await fetchAndInsertPage(cursor, supabase);
      totalImported += imported;
      totalSkipped += skipped;
      completedPages++;
      cursor = nextCursor;

      // No more results
      if (!nextCursor) break;
    }

    return NextResponse.json({
      data: { totalImported, totalSkipped, pages: completedPages, nextCursor: cursor },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
