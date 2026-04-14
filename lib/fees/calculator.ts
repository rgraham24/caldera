/**
 * Caldera Fee Calculator — Single Source of Truth
 *
 * Total fee: 2% on buys · Sells are always free
 *
 * SPLIT:
 * - 1% platform (funds Caldera operations)
 * - 1% token auto-buy (split among active DeSo tokens for this market)
 *   → goes to community pool if no active tokens exist
 *
 * const TOTAL_FEE       = 0.02
 * const PLATFORM_FEE    = 0.01
 * const TOKEN_AUTOBUY   = 0.01
 * const SELL_FEE        = 0
 */

export type CreatorInfo = {
  tier?: string;
  deso_public_key?: string | null;
  deso_username?: string | null;
  creator_coin_price?: number;
  entity_type?: string;
  token_status?: string; // shadow | active_unverified | active_verified | claimed
};

export type FeeBreakdown = {
  total: number;
  platform: number;
  creatorEarning: number;
  personalToken: number;
  teamToken: number;
  leagueToken: number;
  communityPool: number;
  personalTokenBlocked: boolean; // true when creator is active_unverified — auto-buy rerouted to team/league
  labels: {
    personal: string | null;
    team: string | null;
    league: string | null;
  };
  // Legacy compat fields
  grossAmount: number;
  platformFee: number;
  creatorFee: number;
  coinHolderPoolFee: number;
  escrowFee: number;
  marketCreatorFee: number;
  totalFee: number;
  netAmount: number;
};

export function calculateMarketFees(
  tradeAmountUsd: number,
  creator?: CreatorInfo | null,
  teamCreator?: CreatorInfo | null,
  leagueCreator?: CreatorInfo | null
): FeeBreakdown {
  const total = round(tradeAmountUsd * 0.02);
  const platform = round(tradeAmountUsd * 0.01);
  const creatorEarning = 0; // no separate creator fee; token auto-buy covers all

  const remainingPool = round(total - platform); // = 1% token auto-buy

  // Personal token auto-buy requires explicit claim/verification to protect
  // unclaimed celebrity identities from Caldera-driven price appreciation.
  // Team and league tokens (outlets, orgs) are exempt from this restriction.
  const isFullyActive = (c?: CreatorInfo | null) =>
    c?.token_status === "active_verified" ||
    c?.token_status === "claimed";

  // Team and league tokens can receive auto-buys even if unverified —
  // they represent outlets/organizations rather than individual people.
  const isTeamEligible = (c?: CreatorInfo | null) =>
    c?.token_status === "active_unverified" ||
    c?.token_status === "active_verified" ||
    c?.token_status === "claimed";

  const personalBlocked =
    creator?.token_status === "active_unverified" &&
    (creator?.creator_coin_price ?? 0) > 0;

  const hasPersonal = isFullyActive(creator) && (creator?.creator_coin_price ?? 0) > 0;
  const hasTeam = isTeamEligible(teamCreator) && (teamCreator?.creator_coin_price ?? 0) > 0;
  const hasLeague = isTeamEligible(leagueCreator) && (leagueCreator?.creator_coin_price ?? 0) > 0;

  const tierCount = [hasPersonal, hasTeam, hasLeague].filter(Boolean).length;
  const perTier = tierCount > 0 ? round(remainingPool / tierCount) : 0;
  const communityPool = tierCount === 0 ? remainingPool : 0;

  // Base allocation
  let personalToken = hasPersonal ? perTier : 0;
  let teamToken = hasTeam ? perTier : 0;
  let leagueToken = hasLeague ? perTier : 0;

  // When personalToken is blocked, reroute the personal share to team or league
  if (personalBlocked && !hasPersonal) {
    const blockedShare = round(remainingPool / (tierCount + 1)); // what personal would have gotten
    if (hasTeam) {
      teamToken = round(teamToken + blockedShare);
    } else if (hasLeague) {
      leagueToken = round(leagueToken + blockedShare);
    }
    // else it stays in communityPool (already captured above as tierCount === 0 path)
  }

  return {
    total,
    platform,
    creatorEarning,
    personalToken,
    teamToken,
    leagueToken,
    communityPool,
    personalTokenBlocked: personalBlocked,
    labels: {
      personal: creator?.deso_username ? `$${creator.deso_username}` : null,
      team: teamCreator?.deso_username
        ? `$${teamCreator.deso_username}`
        : null,
      league: leagueCreator?.deso_username
        ? `$${leagueCreator.deso_username}`
        : null,
    },
    // Legacy compat
    grossAmount: tradeAmountUsd,
    platformFee: platform,
    creatorFee: creatorEarning,
    coinHolderPoolFee: round(personalToken + teamToken + leagueToken),
    escrowFee: 0,
    marketCreatorFee: 0,
    totalFee: total,
    netAmount: round(tradeAmountUsd - total),
  };
}

// Legacy wrapper for existing code that calls calculateFees
export type MarketFeeType = "standard" | "user_created" | "official_creator";
export type CreatorTier = "verified_creator" | "public_figure" | "unclaimed";
export type EntityType = string;

export function calculateFees(
  grossAmount: number,
  _marketType: MarketFeeType,
  _config: Record<string, string>,
  creatorTier?: CreatorTier,
  entityType?: EntityType
): FeeBreakdown {
  return calculateMarketFees(grossAmount, {
    tier: creatorTier || "unclaimed",
    entity_type: entityType || "individual",
    deso_public_key: null,
    creator_coin_price: 0,
  });
}

export function getMarketFeeType(market: {
  creator_id: string | null;
  created_by_user_id: string | null;
}): MarketFeeType {
  if (market.creator_id) return "official_creator";
  if (market.created_by_user_id) return "user_created";
  return "standard";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
