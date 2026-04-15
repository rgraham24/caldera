import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  try {
    // Fetch DESO price and user's coin holdings in parallel
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

    // UsersYouHODL contains the creator coins this user holds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hodlings: any[] = hodlData?.UserList?.[0]?.UsersYouHODL ?? [];

    if (hodlings.length === 0) {
      return NextResponse.json({ holdings: [] });
    }

    // Fetch profiles for all creators in one batch call
    const creatorPublicKeys = hodlings.map((h: any) => h.CreatorPublicKeyBase58Check);
    const profilesRes = await fetch("https://api.deso.org/api/v0/get-users-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeysBase58Check: creatorPublicKeys,
        SkipForLeaderboard: true,
      }),
    });
    const profilesData = await profilesRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profilesData?.UserList ?? []).map((u: any) => [
        u.PublicKeyBase58Check,
        u.ProfileEntryResponse,
      ])
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holdings = hodlings.map((h: any) => {
      const creatorPk = h.CreatorPublicKeyBase58Check;
      const profile = profileMap.get(creatorPk);
      const coinPriceDeSo = (profile?.CoinEntry?.CoinPriceDeSoNanos ?? 0) / 1e9;
      const coinPriceUSD = coinPriceDeSo * desoUSD;

      return {
        creatorPublicKey: creatorPk,
        username: profile?.Username ?? "",
        displayName: profile?.ExtraData?.DisplayName ?? profile?.Username ?? "",
        imageUrl: creatorPk
          ? `https://node.deso.org/api/v0/get-single-profile-picture/${creatorPk}`
          : null,
        balanceNanos: h.BalanceNanos ?? 0,
        coinPriceUSD,
        hasPurchased: h.HasPurchased ?? false,
      };
    }).filter((h: any) => h.balanceNanos > 0);

    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ holdings: [] });
  }
}
