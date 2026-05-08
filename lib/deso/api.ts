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

export async function getPostCount(publicKey: string): Promise<number> {
  try {
    const res = await fetch(`${DESO_API}/get-posts-for-public-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeyBase58Check: publicKey,
        NumToFetch: 10,
        LastPostHashHex: "",
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.Posts?.length || 0;
  } catch {
    return 0;
  }
}

export type TopHolder = {
  username: string;
  publicKey: string;
  balanceNanos: number;
  balanceCoins: number;
  percentOwned: number;
};

export async function getTopHolders(
  creatorPublicKey: string,
  totalCoinsInCirculation: number
): Promise<TopHolder[]> {
  const res = await fetch(`${DESO_API}/get-hodlers-for-public-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      PublicKeyBase58Check: creatorPublicKey,
      NumToFetch: 20,
      FetchAll: false,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const entries = data.Hodlers || [];
  const totalNanos = totalCoinsInCirculation * 1e9 || 1;
  return entries.map((h: { HODLerPublicKeyBase58Check: string; BalanceNanos: number; ProfileEntryResponse?: { Username?: string } }) => ({
    username: h.ProfileEntryResponse?.Username || h.HODLerPublicKeyBase58Check.slice(0, 10),
    publicKey: h.HODLerPublicKeyBase58Check,
    balanceNanos: h.BalanceNanos,
    balanceCoins: h.BalanceNanos / 1e9,
    percentOwned: (h.BalanceNanos / totalNanos) * 100,
  }));
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
        IncludeBalance: true,
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
        SkipForLeaderboard: false,
        IncludeBalance: true,
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

import {
  buyCreatorCoin as desoBuyCreatorCoin,
  sellCreatorCoin as desoSellCreatorCoin,
  updateFollowingStatus as desoUpdateFollowingStatus,
} from "deso-protocol";

// We request the FULL broad scope (BROAD_SPENDING_LIMIT_OPTIONS from
// identity.ts) on every re-authorization — never a per-feature narrow
// subset. Otherwise a Follow re-auth would grant only AUTHORIZE_DERIVED_KEY
// + FOLLOW, then the next CREATOR_COIN buy would trigger ANOTHER popup
// granting only AUTHORIZE_DERIVED_KEY + CREATOR_COIN, and so on per
// feature touched. Mirror of the focus.xyz pattern: one popup grants
// everything Caldera uses today + future features.
//
// The hasPermissions() check stays narrow — we want to detect when a
// SPECIFIC op is missing to decide whether to prompt at all. Only the
// REQUEST scope is broad.

async function ensureCreatorCoinPermissions() {
  const { getDesoIdentity, BROAD_SPENDING_LIMIT_OPTIONS } = await import("@/lib/deso/identity");
  const id = getDesoIdentity();
  const hasPermission = id.hasPermissions({
    TransactionCountLimitMap: { CREATOR_COIN: 1 } as Record<string, number>,
  });
  if (!hasPermission) {
    await id.requestPermissions(BROAD_SPENDING_LIMIT_OPTIONS);
  }
}

export async function buyCreatorCoin(
  updaterPublicKey: string,
  creatorPublicKey: string,
  desoToSellNanos: number
): Promise<{ txnHash: string } | null> {
  try {
    await ensureCreatorCoinPermissions();
    // SDK handles construct + sign (via derived key) + submit — no popup
    const result = await desoBuyCreatorCoin({
      UpdaterPublicKeyBase58Check: updaterPublicKey,
      CreatorPublicKeyBase58Check: creatorPublicKey,
      DeSoToSellNanos: desoToSellNanos,
      MinCreatorCoinExpectedNanos: 0,
      MinFeeRateNanosPerKB: 1000,
    });
    return { txnHash: result.submittedTransactionResponse?.TxnHashHex ?? "" };
  } catch (err) {
    console.error("[buyCreatorCoin]", err);
    throw err;
  }
}

export async function sellCreatorCoin(
  updaterPublicKey: string,
  creatorPublicKey: string,
  creatorCoinToSellNanos: number
): Promise<{ txnHash: string } | null> {
  try {
    await ensureCreatorCoinPermissions();
    const result = await desoSellCreatorCoin({
      UpdaterPublicKeyBase58Check: updaterPublicKey,
      CreatorPublicKeyBase58Check: creatorPublicKey,
      CreatorCoinToSellNanos: creatorCoinToSellNanos,
      MinDeSoExpectedNanos: 0,
      MinFeeRateNanosPerKB: 1000,
    });
    return { txnHash: result.submittedTransactionResponse?.TxnHashHex ?? "" };
  } catch (err) {
    console.error("[sellCreatorCoin]", err);
    throw err;
  }
}

export async function getUserCreatorCoinBalance(
  holderPublicKey: string,
  creatorPublicKey: string
): Promise<number> {
  try {
    const res = await fetch(`${DESO_API}/get-users-stateless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeysBase58Check: [holderPublicKey],
        SkipForLeaderboard: false,
        IncludeBalance: true,
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const hodlings: { CreatorPublicKeyBase58Check: string; BalanceNanos: number }[] =
      data?.UserList?.[0]?.UsersYouHODL ?? [];
    const match = hodlings.find(
      (h) => h.CreatorPublicKeyBase58Check === creatorPublicKey
    );
    return match ? match.BalanceNanos / 1e9 : 0;
  } catch {
    return 0;
  }
}

export async function getCreatorCoinQuote(
  creatorPublicKey: string,
  desoToSpendNanos: number,
  updaterPublicKey: string
): Promise<{ coinsToReceive: number; foundersRewardCoins: number } | null> {
  try {
    const res = await fetch(`${DESO_API}/buy-or-sell-creator-coin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: updaterPublicKey,
        CreatorPublicKeyBase58Check: creatorPublicKey,
        OperationType: "buy",
        DeSoToSellNanos: desoToSpendNanos,
        MinCreatorCoinExpectedNanos: 0,
        MinFeeRateNanosPerKB: 1000,
        Broadcast: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      coinsToReceive: (data.ExpectedCreatorCoinReturnedNanos ?? 0) / 1e9,
      foundersRewardCoins: (data.FounderRewardGeneratedNanos ?? 0) / 1e9,
    };
  } catch {
    return null;
  }
}

// ─── DeSo follow / unfollow ──────────────────────────────────────────────────
//
// Follow state lives on the DeSo blockchain (UPDATE_FOLLOWING_STATUS tx). We
// route every follow / unfollow through this helper so it goes through the
// SDK's derived-key signing path — no platform-seed involvement, the user
// signs their own follow tx with their own wallet.
//
// Cost: each tx burns ~250 DeSo nanos (fraction of a cent). The
// permission grant authorizes 1000 follows up front, with a GlobalDESOLimit
// cap so the user can't accidentally rack up cost.

// Canonical TransactionType enum value is "FOLLOW" (not
// "UPDATE_FOLLOWING_STATUS" — verified against the SDK's
// guardTxPermission). Identity.ts grants FOLLOW in the initial
// connect scope, so this fallback only fires for sessions whose
// derived key was authorized before that scope was broadened.
//
// When it does fire, it requests the FULL broad scope from
// identity.ts (not a narrow FOLLOW-only subset) so one re-auth
// covers every feature, not just follows.

async function ensureFollowPermissions() {
  const { getDesoIdentity, BROAD_SPENDING_LIMIT_OPTIONS } = await import("@/lib/deso/identity");
  const id = getDesoIdentity();
  const hasPermission = id.hasPermissions({
    TransactionCountLimitMap: { FOLLOW: 1 } as Record<string, number>,
  });
  if (!hasPermission) {
    await id.requestPermissions(BROAD_SPENDING_LIMIT_OPTIONS);
  }
}

/**
 * Follow or unfollow a DeSo profile. Constructs, signs (via derived key),
 * and submits the UPDATE_FOLLOWING_STATUS tx in a single SDK call.
 *
 * Throws on permission denial / network error / DeSo-side rejection. Caller
 * is responsible for optimistic UI + rollback on throw.
 */
export async function followCreator(
  followerPublicKey: string,
  followedPublicKey: string,
  isUnfollow: boolean
): Promise<{ txnHash: string } | null> {
  try {
    await ensureFollowPermissions();
    const result = await desoUpdateFollowingStatus({
      FollowerPublicKeyBase58Check: followerPublicKey,
      FollowedPublicKeyBase58Check: followedPublicKey,
      IsUnfollow: isUnfollow,
      MinFeeRateNanosPerKB: 1000,
    });
    return { txnHash: result.submittedTransactionResponse?.TxnHashHex ?? "" };
  } catch (err) {
    console.error("[followCreator]", err);
    throw err;
  }
}
