import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTopProfiles, getDesoPrice, getPostCount } from "@/lib/deso/api";
import { determineTokenStatus } from "@/lib/token-status";
import { isAdminAuthorized } from "@/lib/admin/auth";

/**
 * GET /api/creators/sync-from-deso?desoPublicKey=...&adminPassword=...
 *
 * Admin-only. Pulls the top 100 DeSo profiles by influencer-coin price and
 * upserts them into `creators` keyed on deso_public_key.
 *
 * Phase 5c hardening:
 *   - Admin auth (was previously unauthenticated GET)
 *   - Single upsert path keyed on deso_public_key (was INSERT-or-UPDATE
 *     keyed on case-sensitive deso_username, which produced duplicates)
 *   - Backfills is_bitclout_original from bitclout_reserved_usernames so
 *     newly-synced rows enter the verification gate correctly
 *   - Per-row try/catch so one bad profile doesn't kill the whole sync
 */
export async function GET(req: NextRequest) {
  const adminPassword = req.nextUrl.searchParams.get("adminPassword") ?? undefined;
  const desoPublicKey = req.nextUrl.searchParams.get("desoPublicKey") ?? undefined;
  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const [profiles, desoPrice] = await Promise.all([
      getTopProfiles(100),
      getDesoPrice(),
    ]);

    // Pre-fetch the BitClout-original reserved set once; cheap O(1) membership
    // checks per profile. Phase 4a populated this table from upstream.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reservedRows } = await (supabase as any)
      .from("bitclout_reserved_usernames")
      .select("username");
    const reservedSet = new Set<string>(
      ((reservedRows ?? []) as Array<{ username: string }>).map((r) =>
        r.username.toLowerCase()
      )
    );

    let synced = 0;
    let errors = 0;
    const errorDetails: Array<{ username: string; error: string }> = [];

    for (const p of profiles) {
      const username = p.Username;
      if (!username) continue;
      const publicKey = p.PublicKeyBase58Check;
      if (!publicKey) continue;

      try {
        const coinPriceNanos = p.CoinPriceDeSoNanos || 0;
        const coinPriceUSD = (coinPriceNanos / 1e9) * desoPrice;
        if (coinPriceUSD < 1) continue;

        const holders = p.CoinEntry?.NumberOfHolders || 0;
        const coinsNanos = p.CoinEntry?.CoinsInCirculationNanos || 0;
        const coinsInCirculation = coinsNanos / 1e9;
        const marketCap = coinsInCirculation * coinPriceUSD;
        const slug = username
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const picUrl = `https://diamondapp.com/api/v0/get-single-profile-picture/${publicKey}`;
        const isReserved = p.IsReserved || false;
        const isVerified = p.IsVerified || false;
        const postCount = await getPostCount(publicKey);
        const tokenStatus = determineTokenStatus({
          deso_username: username,
          deso_is_reserved: isReserved,
          deso_is_verified: isVerified,
          deso_post_count: postCount,
        });
        const isBitcloutOriginal = reservedSet.has(username.toLowerCase());

        // Tier preservation: if the existing row is already claimed, keep
        // token_status='claimed' regardless of what determineTokenStatus
        // returns from current DeSo data. Look up by deso_public_key — the
        // same key the upsert conflict-resolves on (Phase 5a UNIQUE index).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("creators")
          .select("id, tier")
          .eq("deso_public_key", publicKey)
          .maybeSingle();

        const finalTokenStatus =
          existing?.tier === "verified_creator" ? "claimed" : tokenStatus;

        const now = new Date().toISOString();
        const payload = {
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
          tier: existing?.tier ?? "unclaimed",
          deso_is_reserved: isReserved,
          deso_is_verified: isVerified,
          deso_post_count: postCount,
          token_status: finalTokenStatus,
          is_bitclout_original: isBitcloutOriginal,
          coin_data_updated_at: now,
        };

        const { error: upsertError } = await supabase
          .from("creators")
          .upsert(payload, { onConflict: "deso_public_key" });

        if (upsertError) throw new Error(upsertError.message);
        synced++;
      } catch (err) {
        errors++;
        errorDetails.push({
          username,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      data: {
        synced,
        errors,
        total: profiles.length,
        errorDetails: errors > 0 ? errorDetails.slice(0, 10) : undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
