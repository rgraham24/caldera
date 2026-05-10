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

      // Resolve creators (deso_public_key → { id, slug })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creators } = await (supabase as any)
        .from("creators")
        .select("id, deso_public_key, slug")
        .in("deso_public_key", pks);
      const creatorById = new Map<string, { id: string; slug: string | null }>();
      const creatorByPk = new Map<string, { id: string; slug: string | null }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (creators ?? []) as Array<any>) {
        creatorById.set(c.id, { id: c.id, slug: c.slug ?? null });
        creatorByPk.set(c.deso_public_key, { id: c.id, slug: c.slug ?? null });
      }
      holdings.forEach((h: any) => {
        h.creatorSlug = creatorByPk.get(h.creatorPublicKey)?.slug ?? null;
      });

      // Look up the local user_id from the requesting publicKey, then
      // fetch all user_coin_purchases for this user keyed by creator_id.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbUser } = await (supabase as any)
        .from("users")
        .select("id")
        .eq("deso_public_key", publicKey)
        .maybeSingle();

      if (dbUser?.id) {
        const creatorIds = Array.from(creatorById.keys());
        if (creatorIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: purchases } = await (supabase as any)
            .from("user_coin_purchases")
            .select("creator_id, coins_purchased, price_per_coin_usd")
            .eq("user_id", dbUser.id)
            .in("creator_id", creatorIds);

          // Aggregate per creator_id: weighted avg price + total cost
          const byCreator = new Map<string, { coins: number; cost: number }>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of (purchases ?? []) as Array<any>) {
            const coins = Number(p.coins_purchased ?? 0);
            const price = Number(p.price_per_coin_usd ?? 0);
            if (!Number.isFinite(coins) || !Number.isFinite(price)) continue;
            const cur = byCreator.get(p.creator_id) ?? { coins: 0, cost: 0 };
            cur.coins += coins;
            cur.cost += coins * price;
            byCreator.set(p.creator_id, cur);
          }

          // Apply back to holdings (re-use creatorByPk to resolve creator_id)
          holdings.forEach((h: any) => {
            const c = creatorByPk.get(h.creatorPublicKey);
            if (!c) return;
            const agg = byCreator.get(c.id);
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
