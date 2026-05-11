import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  try {
    const [hodlRes, priceRes] = await Promise.all([
      fetch("https://api.deso.org/api/v0/get-users-stateless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          PublicKeysBase58Check: [publicKey],
          SkipForLeaderboard: false,
          IncludeBalance: true,
        }),
      }),
      fetch("https://api.deso.org/api/v0/get-exchange-rate"),
    ]);

    const [hodlData, priceData] = await Promise.all([hodlRes.json(), priceRes.json()]);
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;

    // UsersYouHODL = creator coins this user holds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hodlings: any[] = hodlData?.UserList?.[0]?.UsersYouHODL ?? [];

    if (hodlings.length === 0) return NextResponse.json({ holdings: [] });

    // Fetch live profiles for all creators in one batch
    const creatorPublicKeys = hodlings.map((h: any) => h.CreatorPublicKeyBase58Check);
    const profilesRes = await fetch("https://api.deso.org/api/v0/get-users-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeysBase58Check: creatorPublicKeys, SkipForLeaderboard: true }),
    });
    const profilesData = await profilesRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profilesData?.UserList ?? []).map((u: any) => [u.PublicKeyBase58Check, u.ProfileEntryResponse])
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holdings = hodlings.map((h: any) => {
      const creatorPk = h.CreatorPublicKeyBase58Check;
      const profile = profileMap.get(creatorPk);
      const coinPriceDeSo = (profile?.CoinPriceDeSoNanos ?? 0) / 1e9;
      const coinPriceUSD = coinPriceDeSo * desoUSD;
      const coinsHeld = (h.BalanceNanos ?? 0) / 1e9;
      return {
        creatorPublicKey: creatorPk,
        username: profile?.Username ?? "",
        displayName: profile?.ExtraData?.DisplayName ?? profile?.Username ?? "",
        imageUrl: creatorPk ? `https://node.deso.org/api/v0/get-single-profile-picture/${creatorPk}` : null,
        balanceNanos: h.BalanceNanos ?? 0,
        coinPriceUSD,
        hasPurchased: h.HasPurchased ?? false,
        totalValueUSD: coinsHeld * coinPriceUSD,
        creatorSlug: null as string | null,
        avgBuyPriceUSD: null as number | null,
        costBasisUSD: null as number | null,
        percentGain: null as number | null,
      };
    })
    // Filter dust: only show holdings worth at least $0.01 OR more than 0.001 coins
    .filter((h: any) => (h.totalValueUSD ?? 0) >= 0.01)
    // Sort by value descending
    .sort((a: any, b: any) => b.totalValueUSD - a.totalValueUSD);

    // Enrich with Caldera DB data: creator slug (for linking) + avg buy
    // price from user_coin_purchases (Caldera-side purchase records).
    // Holdings the user bought outside Caldera (e.g. on Diamond) wont
    // have a user_coin_purchases row — those keep avgBuyPriceUSD = null
    // and the UI hides the % gain field for them.
    if (holdings.length > 0) {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const supabase = createServiceClient();

      const pks = holdings.map((h: any) => h.creatorPublicKey).filter(Boolean);

      // Resolve creators (deso_public_key → multiple { id, slug } rows
      // possible — the creators table has duplicate rows for some
      // pubkeys, e.g. cz_binance has 3 slugs, logan-paul has 2).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creators } = await (supabase as any)
        .from("creators")
        .select("id, deso_public_key, slug")
        .in("deso_public_key", pks);

      // creator_id → deso_public_key — the inverse map is what we need
      // for the purchase aggregation below. Many-to-one is fine here
      // because every creator row has exactly one pubkey.
      const creatorIdToPk = new Map<string, string>();
      // pubkey → slug for display linking. When duplicates exist we
      // keep the FIRST seen slug; the duplicate-creator-row issue is
      // tracked as a separate backlog item.
      const pkToSlug = new Map<string, string | null>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (creators ?? []) as Array<any>) {
        creatorIdToPk.set(c.id, c.deso_public_key);
        if (!pkToSlug.has(c.deso_public_key)) {
          pkToSlug.set(c.deso_public_key, c.slug ?? null);
        }
      }
      holdings.forEach((h: any) => {
        h.creatorSlug = pkToSlug.get(h.creatorPublicKey) ?? null;
      });

      // Look up the local user_id from the requesting publicKey, then
      // fetch all user_coin_purchases for this user filtered to the
      // full set of creator_ids that map to any of our holdings' pubkeys.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbUser } = await (supabase as any)
        .from("users")
        .select("id")
        .eq("deso_public_key", publicKey)
        .maybeSingle();

      if (dbUser?.id) {
        const allCreatorIds = Array.from(creatorIdToPk.keys());
        if (allCreatorIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: purchases } = await (supabase as any)
            .from("user_coin_purchases")
            .select("creator_id, coins_purchased, price_per_coin_usd")
            .eq("user_id", dbUser.id)
            .in("creator_id", allCreatorIds);

          // Aggregate by DESO PUBKEY (not creator_id). Two purchases
          // recorded under different creator_ids that point at the
          // same DeSo pubkey are the same coin, so they merge into
          // one weighted average — duplicate creator rows are harmless.
          const byPubkey = new Map<string, { coins: number; cost: number }>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of (purchases ?? []) as Array<any>) {
            const pk = creatorIdToPk.get(p.creator_id);
            if (!pk) continue;
            const coins = Number(p.coins_purchased ?? 0);
            const price = Number(p.price_per_coin_usd ?? 0);
            if (!Number.isFinite(coins) || !Number.isFinite(price)) continue;
            const cur = byPubkey.get(pk) ?? { coins: 0, cost: 0 };
            cur.coins += coins;
            cur.cost += coins * price;
            byPubkey.set(pk, cur);
          }

          // Apply to holdings keyed by pubkey directly — no creator_id
          // race on which-duplicate-won.
          holdings.forEach((h: any) => {
            const agg = byPubkey.get(h.creatorPublicKey);
            if (!agg || agg.coins <= 0) return;
            const avg = agg.cost / agg.coins;
            h.avgBuyPriceUSD = round4(avg);
            h.costBasisUSD = round2(agg.cost);
            if (avg > 0) {
              h.percentGain = round2(((h.coinPriceUSD - avg) / avg) * 100);
            }
          });
        }
      }
    }

    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ holdings: [] });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
