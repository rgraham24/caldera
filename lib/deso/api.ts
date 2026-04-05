const DESO_API = "https://api.deso.org/api/v0";

export async function getDesoPrice(): Promise<number> {
  const res = await fetch(`${DESO_API}/get-exchange-rate`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Failed to fetch DeSo price");
  const data = await res.json();
  return data.USDCentsPerDeSoExchangeRate / 100;
}

export async function getTopProfiles(numToFetch = 100) {
  const res = await fetch(`${DESO_API}/get-profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      OrderBy: "influencer_coin_price",
      NumToFetch: numToFetch,
      NoErrorOnEmpty: true,
    }),
  });
  if (!res.ok) throw new Error("Failed to fetch profiles");
  const data = await res.json();
  return data.ProfilesFound || [];
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

export async function getUserDesoBalance(
  publicKey: string
): Promise<{ balanceNanos: number; balanceUSD: number }> {
  const [res, desoPrice] = await Promise.all([
    fetch(`${DESO_API}/get-users-stateless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeysBase58Check: [publicKey],
        SkipForLeaderboard: true,
      }),
    }),
    getDesoPrice(),
  ]);
  if (!res.ok) throw new Error("Failed to fetch balance");
  const data = await res.json();
  const balanceNanos = data.UserList?.[0]?.BalanceNanos || 0;
  return {
    balanceNanos,
    balanceUSD: (balanceNanos / 1e9) * desoPrice,
  };
}

export async function getCreatorCoinHoldings(
  userPublicKey: string,
  creatorPublicKey: string
): Promise<{ balanceNanos: number; balanceUSD: number }> {
  const [res, desoPrice] = await Promise.all([
    fetch(`${DESO_API}/get-users-stateless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeysBase58Check: [userPublicKey],
        SkipForLeaderboard: true,
      }),
    }),
    getDesoPrice(),
  ]);
  if (!res.ok) return { balanceNanos: 0, balanceUSD: 0 };
  const data = await res.json();
  const holdings =
    data.UserList?.[0]?.UsersYouHODL?.find(
      (h: { CreatorPublicKeyBase58Check: string }) =>
        h.CreatorPublicKeyBase58Check === creatorPublicKey
    );
  const balanceNanos = holdings?.BalanceNanos || 0;
  const creatorProfile = await getCreatorProfile(
    data.UserList?.[0]?.ProfileEntryResponse?.Username || ""
  ).catch(() => null);
  const coinPriceNanos = creatorProfile?.CoinPriceDeSoNanos || 0;
  const balanceUSD = (balanceNanos / 1e9) * (coinPriceNanos / 1e9) * desoPrice;
  return { balanceNanos, balanceUSD };
}

/**
 * Construct, sign, and submit a buy-creator-coin transaction.
 * This runs client-side — calls DeSo API directly + DeSo Identity for signing.
 */
export async function buyCreatorCoin(
  creatorPublicKey: string,
  desoToSpendNanos: number,
  updaterPublicKey: string
): Promise<{ txHash: string }> {
  // 1. Construct transaction
  const constructRes = await fetch(
    `${DESO_API}/buy-or-sell-creator-coin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: updaterPublicKey,
        CreatorPublicKeyBase58Check: creatorPublicKey,
        OperationType: "buy",
        DeSoToSellNanos: desoToSpendNanos,
        MinCreatorCoinExpectedNanos: 0,
        MinFeeRateNanosPerKB: 1000,
      }),
    }
  );

  if (!constructRes.ok) {
    const err = await constructRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to construct transaction");
  }

  const { TransactionHex } = await constructRes.json();

  // 2. Sign via DeSo Identity
  const { identity } = await import("deso-protocol");
  const signedTx = await identity.signTx(TransactionHex);

  // 3. Submit
  const submitRes = await fetch(`${DESO_API}/submit-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      TransactionHex: signedTx,
    }),
  });

  if (!submitRes.ok) {
    throw new Error("Failed to submit transaction");
  }

  const submitData = await submitRes.json();
  return {
    txHash:
      submitData.Transaction?.TransactionIDBase58Check ||
      submitData.TxnHashHex ||
      "",
  };
}

export async function sellCreatorCoin(
  creatorPublicKey: string,
  creatorCoinToSellNanos: number,
  updaterPublicKey: string
): Promise<{ txHash: string }> {
  const constructRes = await fetch(
    `${DESO_API}/buy-or-sell-creator-coin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: updaterPublicKey,
        CreatorPublicKeyBase58Check: creatorPublicKey,
        OperationType: "sell",
        CreatorCoinToSellNanos: creatorCoinToSellNanos,
        MinFeeRateNanosPerKB: 1000,
      }),
    }
  );

  if (!constructRes.ok) {
    const err = await constructRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to construct transaction");
  }

  const { TransactionHex } = await constructRes.json();
  const { identity } = await import("deso-protocol");
  const signedTx = await identity.signTx(TransactionHex);

  const submitRes = await fetch(`${DESO_API}/submit-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signedTx }),
  });

  if (!submitRes.ok) throw new Error("Failed to submit transaction");
  const submitData = await submitRes.json();
  return {
    txHash:
      submitData.Transaction?.TransactionIDBase58Check ||
      submitData.TxnHashHex ||
      "",
  };
}
