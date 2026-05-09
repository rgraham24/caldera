/**
 * Refresh a user's local Caldera profile from their live DeSo profile.
 *
 * Called fire-and-forget on every successful login (see
 * /api/auth/deso-login) so users.* and creators.* self-heal from stale
 * data — usernames that landed as raw pubkeys at signup, missing
 * avatars, display name changes, holder count drift, follower count
 * staleness, etc.
 *
 * Stable identifiers we DO NOT touch:
 *   - users.id, creators.id, creators.slug, creators.deso_public_key
 *
 * Best-effort: any error is logged and swallowed so a flaky DeSo node
 * can't break the login flow.
 */

import { createServiceClient } from "@/lib/supabase/server";

const DESO_PROFILE_TIMEOUT_MS = 5000;

interface DesoProfileResponse {
  Profile?: {
    Username?: string;
    Description?: string | null;
    IsVerified?: boolean;
    PublicKeyBase58Check?: string;
    CoinPriceDeSoNanos?: number;
    CoinEntry?: {
      NumberOfHolders?: number;
      CreatorBasisPoints?: number;
      CoinsInCirculationNanos?: number;
      CoinWatermarkNanos?: number;
      DeSoLockedNanos?: number;
    };
    ExtraData?: {
      LargeProfilePicURL?: string;
      FeaturedImageURL?: string;
      [k: string]: unknown;
    };
  };
}

interface DesoFollowsResponse {
  NumFollowers?: number;
  NumFollowing?: number;
}

interface DesoExchangeRateResponse {
  USDCentsPerDeSoExchangeRate?: number;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await p;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDesoProfile(
  desoPublicKey: string
): Promise<DesoProfileResponse["Profile"] | null> {
  return withTimeout(
    (async () => {
      const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PublicKeyBase58Check: desoPublicKey }),
      });
      if (!res.ok) return null;
      const data: DesoProfileResponse = await res.json();
      return data.Profile ?? null;
    })(),
    DESO_PROFILE_TIMEOUT_MS
  );
}

async function fetchFollowerCount(desoPublicKey: string): Promise<number | null> {
  const res = await withTimeout(
    (async () => {
      const r = await fetch("https://api.deso.org/api/v0/get-follows-stateless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          PublicKeyBase58Check: desoPublicKey,
          GetEntriesFollowingUsername: true,
          NumToFetch: 1,
        }),
      });
      if (!r.ok) return null;
      const data: DesoFollowsResponse = await r.json();
      return data;
    })(),
    DESO_PROFILE_TIMEOUT_MS
  );
  return res?.NumFollowers ?? null;
}

async function fetchDesoUsdRate(): Promise<number | null> {
  const res = await withTimeout(
    (async () => {
      const r = await fetch("https://api.deso.org/api/v0/get-exchange-rate", {
        method: "GET",
      });
      if (!r.ok) return null;
      const data: DesoExchangeRateResponse = await r.json();
      return data;
    })(),
    DESO_PROFILE_TIMEOUT_MS
  );
  if (!res?.USDCentsPerDeSoExchangeRate) return null;
  return res.USDCentsPerDeSoExchangeRate / 100;
}

/**
 * Refresh users + creators rows from live DeSo profile data. Idempotent;
 * safe to call on every login. Never throws.
 */
export async function syncUserProfile(desoPublicKey: string): Promise<void> {
  if (!desoPublicKey) return;

  // Three parallel calls so the whole sync is bounded by the slowest of
  // ~1.5s (vs 4-5s serial). Profile is the only one we hard-require;
  // followers + USD rate degrade to "skip that field" if they fail.
  const [profile, followers, usdPerDeso] = await Promise.all([
    fetchDesoProfile(desoPublicKey),
    fetchFollowerCount(desoPublicKey),
    fetchDesoUsdRate(),
  ]);

  if (!profile) {
    console.warn(
      "[syncUserProfile] no profile from DeSo for",
      desoPublicKey.slice(0, 12) + "..."
    );
    return;
  }

  const username = profile.Username?.trim() || null;
  const bio = profile.Description?.trim() || null;
  const avatarUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${desoPublicKey}`;
  const isVerified = Boolean(profile.IsVerified);

  // CoinEntry fields. NumberOfHolders + CreatorBasisPoints are direct;
  // market cap is computed from CoinsInCirculationNanos × price.
  const coinEntry = profile.CoinEntry ?? {};
  const numHolders = coinEntry.NumberOfHolders ?? null;
  const founderRewardBp = coinEntry.CreatorBasisPoints ?? null;
  const circulationNanos = coinEntry.CoinsInCirculationNanos ?? 0;

  const priceDeso = (profile.CoinPriceDeSoNanos ?? 0) / 1e9;
  const priceUsd = usdPerDeso !== null ? priceDeso * usdPerDeso : null;
  const marketCapUsd =
    priceUsd !== null && circulationNanos > 0
      ? (circulationNanos / 1e9) * priceUsd
      : null;

  const supabase = createServiceClient();

  // ── users row ─────────────────────────────────────────────────────
  if (username) {
    const usersUpdate: Record<string, unknown> = {
      username,
      display_name: username,
      avatar_url: avatarUrl,
      is_verified: isVerified,
      updated_at: new Date().toISOString(),
    };
    if (bio !== null) usersUpdate.bio = bio;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: usersErr } = await (supabase as any)
      .from("users")
      .update(usersUpdate)
      .eq("deso_public_key", desoPublicKey);
    if (usersErr) {
      console.warn("[syncUserProfile] users update failed:", usersErr.message);
    }
  }

  // ── creators row (only updates if one exists; never inserts) ──────
  // We compute the new token_status carefully:
  //   - If price > 0 AND IsVerified → "active_verified"
  //   - If price > 0 AND holders > 0 → "active_unverified"
  //   - Otherwise → leave existing value untouched (don't downgrade)
  if (username) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCreator } = await (supabase as any)
      .from("creators")
      .select("token_status")
      .eq("deso_public_key", desoPublicKey)
      .maybeSingle();

    if (existingCreator) {
      const creatorsUpdate: Record<string, unknown> = {
        name: username,
        deso_username: username,
        image_url: avatarUrl,
        coin_data_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (bio !== null) creatorsUpdate.bio = bio;
      // creator_coin_symbol mirrors the DeSo username — convention used
      // elsewhere in the codebase (see CreatorAvatar / coupled-card hero).
      creatorsUpdate.creator_coin_symbol = username;
      if (numHolders !== null) creatorsUpdate.creator_coin_holders = numHolders;
      if (founderRewardBp !== null)
        creatorsUpdate.founder_reward_basis_points = founderRewardBp;
      if (priceUsd !== null) creatorsUpdate.creator_coin_price = priceUsd;
      if (marketCapUsd !== null)
        creatorsUpdate.creator_coin_market_cap = marketCapUsd;
      if (circulationNanos > 0)
        creatorsUpdate.total_coins_in_circulation = circulationNanos / 1e9;
      if (followers !== null) creatorsUpdate.estimated_followers = followers;

      // Token status — only upgrade, never downgrade. Leaves "claimed",
      // "needs_review", "archived", "speculation_pool" untouched.
      const currentStatus = (existingCreator.token_status as string | null) ?? "shadow";
      const isLowerTier = currentStatus === "shadow" || currentStatus === null;
      if (priceUsd !== null && priceUsd > 0 && isLowerTier) {
        creatorsUpdate.token_status =
          isVerified || (numHolders !== null && numHolders > 0)
            ? isVerified
              ? "active_verified"
              : "active_unverified"
            : currentStatus;
      } else if (
        currentStatus === "active_unverified" &&
        isVerified &&
        priceUsd !== null &&
        priceUsd > 0
      ) {
        // Upgrade unverified → verified when DeSo flags the profile.
        creatorsUpdate.token_status = "active_verified";
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: creatorsErr } = await (supabase as any)
        .from("creators")
        .update(creatorsUpdate)
        .eq("deso_public_key", desoPublicKey);
      if (creatorsErr) {
        console.warn(
          "[syncUserProfile] creators update failed:",
          creatorsErr.message
        );
      }
    }
  }
}
