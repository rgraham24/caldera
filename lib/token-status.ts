/**
 * Token Status Determination
 *
 * Ethical model: token earning only activates when the real person
 * has consented to being on DeSo (IsReserved=false) or claimed on Caldera.
 *
 * shadow: No DeSo profile, or BitClout reserved (never consented)
 *   → Prediction markets work, NO token holder earnings
 *   → Fees go to community pool
 *
 * active_unverified: Real person created their DeSo account (IsReserved=false)
 *   → Token exists and earns (person chose to participate)
 *   → Not formally verified — could be impersonator
 *
 * active_verified: Formally verified on DeSo (IsVerified=true)
 *   → Full token earning, highest trust
 *
 * claimed: Verified on Caldera specifically
 *   → Earns 0.75% directly + token holders earn 0.75%
 */

export type TokenStatus = "shadow" | "active_unverified" | "active_verified" | "claimed";

export function determineTokenStatus(creator: {
  deso_username?: string | null;
  deso_is_reserved?: boolean;
  deso_is_verified?: boolean;
  tier?: string;
}): TokenStatus {
  // Claimed on Caldera overrides everything
  if (creator.tier === "verified_creator") return "claimed";

  // No DeSo profile
  if (!creator.deso_username) return "shadow";

  // BitClout reserved — person never consented
  if (creator.deso_is_reserved === true) return "shadow";

  // Formally verified on DeSo
  if (creator.deso_is_verified === true) return "active_verified";

  // Real person created their own account (not reserved, not verified)
  if (creator.deso_is_reserved === false) return "active_unverified";

  return "shadow";
}

export function tokenStatusLabel(status: TokenStatus): string {
  switch (status) {
    case "claimed": return "✅ Caldera verified";
    case "active_verified": return "✅ Verified DeSo token";
    case "active_unverified": return "🔵 DeSo token · unverified";
    case "shadow": return "📊 Prediction market only";
  }
}

export function tokenEarnsFromTrades(status: TokenStatus): boolean {
  return status !== "shadow";
}
