const DESO_API = "https://api.deso.org/api/v0";

export async function getDesoPrice(): Promise<number> {
  const res = await fetch(`${DESO_API}/get-exchange-rate`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Failed to fetch DeSo price");
  const data = await res.json();
  return data.USDCentsPerDeSoExchangeRate / 100;
}

export async function getCreatorProfile(username: string) {
  const res = await fetch(`${DESO_API}/get-single-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Username: username }),
  });
  if (!res.ok) throw new Error(`Failed to fetch profile: ${username}`);
  const data = await res.json();
  return data.Profile;
}

export type CreatorCoinData = {
  priceUSD: number;
  holders: number;
  coinsInCirculation: number;
  publicKey: string;
  profilePicUrl: string;
  username: string;
  description: string | null;
};

export async function getCreatorCoinData(
  username: string
): Promise<CreatorCoinData> {
  const [profile, desoPrice] = await Promise.all([
    getCreatorProfile(username),
    getDesoPrice(),
  ]);

  const priceInDeso = (profile.CoinPriceDeSoNanos || 0) / 1e9;
  const priceUSD = priceInDeso * desoPrice;

  return {
    priceUSD,
    holders: profile.CoinEntry?.NumberOfHolders || 0,
    coinsInCirculation: (profile.CoinEntry?.CoinsInCirculationNanos || 0) / 1e9,
    publicKey: profile.PublicKeyBase58Check,
    profilePicUrl: `https://diamondapp.com/api/v0/get-single-profile-picture/${profile.PublicKeyBase58Check}`,
    username: profile.Username,
    description: profile.Description || null,
  };
}
