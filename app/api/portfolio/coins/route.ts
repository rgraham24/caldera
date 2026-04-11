import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  try {
    // Fetch all creator coins held by this user from DeSo
    const res = await fetch("https://api.deso.org/api/v0/get-hodlers-for-public-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeyBase58Check: publicKey,
        FetchHodlings: true,
        NumToFetch: 500,
        IsDAOCoin: false,
      }),
    });
    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holdings = (data?.Hodlers ?? []).map((h: any) => ({
      creatorPublicKey: h.CreatorPublicKeyBase58Check,
      username: h.ProfileEntryResponse?.Username ?? "",
      displayName: h.ProfileEntryResponse?.ExtraData?.DisplayName ?? h.ProfileEntryResponse?.Username ?? "",
      imageUrl: h.ProfileEntryResponse?.PublicKeyBase58Check
        ? `https://node.deso.org/api/v0/get-single-profile-picture/${h.ProfileEntryResponse.PublicKeyBase58Check}`
        : null,
      balanceNanos: h.BalanceNanos ?? 0,
      coinPriceUSD: (h.ProfileEntryResponse?.CoinPriceDeSoNanos ?? 0) / 1e9,
      hasPurchased: h.HasPurchased ?? false,
    }));

    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ holdings: [] });
  }
}
