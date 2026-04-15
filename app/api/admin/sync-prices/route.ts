import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdminAuthorized } from "@/lib/admin/auth";
import { getCreatorCoinData } from "@/lib/deso/api";

/**
 * POST /api/admin/sync-prices
 * Bulk-fetches DeSo coin prices for all creators with a deso_username
 * and updates creator_coin_price in Supabase.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { adminPassword, desoPublicKey } = body;

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: creators, error } = await supabase
    .from("creators")
    .select("id, slug, deso_username")
    .not("deso_username", "is", null)
    .limit(200);

  if (error || !creators?.length) {
    return NextResponse.json({ synced: 0, errors: 0, message: "No creators with DeSo usernames found" });
  }

  let synced = 0;
  let errors = 0;

  // Process in batches of 5 to avoid overwhelming DeSo API
  const batchSize = 5;
  for (let i = 0; i < creators.length; i += batchSize) {
    const batch = creators.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (creator) => {
        try {
          const coinData = await getCreatorCoinData(creator.deso_username!);
          await supabase
            .from("creators")
            .update({
              creator_coin_price: Math.round(coinData.priceUSD * 10000) / 10000,
              creator_coin_holders: coinData.holders,
              total_coins_in_circulation: coinData.coinsInCirculation,
              deso_public_key: coinData.publicKey,
              profile_pic_url: coinData.profilePicUrl ?? undefined,
              coin_data_updated_at: new Date().toISOString(),
            })
            .eq("id", creator.id);
          synced++;
        } catch {
          errors++;
        }
      })
    );
    // Small delay between batches
    if (i + batchSize < creators.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return NextResponse.json({
    synced,
    errors,
    total: creators.length,
    message: `Synced ${synced}/${creators.length} creators${errors > 0 ? `, ${errors} failed` : ""}`,
  });
}
