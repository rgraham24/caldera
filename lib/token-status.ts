/**
 * Definitive Token Status Determination
 *
 * Uses DeSo's IsReserved + post count as the authoritative signal.
 * Post count > 0 on a reserved account = they got their seed phrase and participated.
 *
 * shadow: No DeSo profile, OR BitClout reserved + never posted
 * active_unverified: Posted on DeSo (reserved or self-created, posts > 0)
 * active_verified: Formally verified on DeSo (IsVerified=true)
 * claimed: Verified on Caldera specifically
 * needs_review: Self-created but never posted — could be impersonator
 */

export type TokenStatus = "shadow" | "active_unverified" | "active_verified" | "claimed" | "needs_review";

export function determineTokenStatus(creator: {
  deso_username?: string | null;
  deso_is_reserved?: boolean;
  deso_is_verified?: boolean;
  deso_post_count?: number;
  tier?: string;
}): TokenStatus {
  if (creator.tier === "verified_creator") return "claimed";
  if (!creator.deso_username) return "shadow";
  if (creator.deso_is_verified === true) return "active_verified";

  const postCount = creator.deso_post_count ?? 0;

  // Posted = participated, regardless of reserved status
  if (postCount > 0) return "active_unverified";

  // Reserved + never posted = BitClout created, person never showed
  if (creator.deso_is_reserved === true) return "shadow";

  // Self-created + never posted = could be impersonator
  if (creator.deso_is_reserved === false) return "needs_review";

  return "shadow";
}

export function tokenStatusLabel(status: TokenStatus): string {
  switch (status) {
    case "claimed": return "✅ Verified";
    case "active_verified": return "✅ Verified";
    case "active_unverified": return "🔵 Active token";
    case "needs_review": return "⚠️ Under review";
    case "shadow": return "📊 Prediction market only";
  }
}

export function tokenEarnsFromTrades(status: TokenStatus): boolean {
  return status === "active_unverified" || status === "active_verified" || status === "claimed";
}
