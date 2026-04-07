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
  caldra: number;
  creatorEarning: number;
  personalToken: number;
  teamToken: number;
  leagueToken: number;
  communityPool: number;
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
  const caldra = 0; // folded into platform — no separate line item
  const creatorEarning = 0; // no separate creator fee; token auto-buy covers all

  const remainingPool = round(total - platform); // = 1% token auto-buy

  // Only active tokens earn — shadow profiles go to community pool
  const isActive = (c?: CreatorInfo | null) =>
    c?.token_status === "active_unverified" ||
    c?.token_status === "active_verified" ||
    c?.token_status === "claimed";

  const hasPersonal = isActive(creator) && (creator?.creator_coin_price ?? 0) > 0;
  const hasTeam = isActive(teamCreator) && (teamCreator?.creator_coin_price ?? 0) > 0;
  const hasLeague = isActive(leagueCreator) && (leagueCreator?.creator_coin_price ?? 0) > 0;

  const tierCount = [hasPersonal, hasTeam, hasLeague].filter(Boolean).length;
  const perTier = tierCount > 0 ? round(remainingPool / tierCount) : 0;
  const communityPool = tierCount === 0 ? remainingPool : 0;

  const personalToken = hasPersonal ? perTier : 0;
  const teamToken = hasTeam ? perTier : 0;
  const leagueToken = hasLeague ? perTier : 0;

  return {
    total,
    platform,
    caldra,
    creatorEarning,
    personalToken,
    teamToken,
    leagueToken,
    communityPool,
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
    coinHolderPoolFee: round(personalToken + teamToken + leagueToken + caldra),
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
