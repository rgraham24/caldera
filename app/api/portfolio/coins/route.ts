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
      };
    })
    // Filter dust: only show holdings worth at least $0.01 OR more than 0.001 coins
    .filter((h: any) => (h.totalValueUSD ?? 0) >= 0.01)
    // Sort by value descending
    .sort((a: any, b: any) => b.totalValueUSD - a.totalValueUSD);

    // Cross-reference with Caldera DB to get creator slugs for linking
    if (holdings.length > 0) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const pks = holdings.map((h: any) => h.creatorPublicKey).filter(Boolean);
      const { data: creators } = await supabase
        .from("creators")
        .select("deso_public_key, slug")
        .in("deso_public_key", pks);
      const slugMap = new Map((creators ?? []).map((c: any) => [c.deso_public_key, c.slug]));
      holdings.forEach((h: any) => {
        h.creatorSlug = slugMap.get(h.creatorPublicKey) ?? null;
      });
    }

    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ holdings: [] });
  }
}
