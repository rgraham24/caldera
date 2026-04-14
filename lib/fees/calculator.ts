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
  claim_status?: string | null; // 'unclaimed' | 'pending_claim' | 'claimed'
  claimed_deso_key?: string | null;
};

export type FeeBreakdown = {
  total: number;
  platform: number;
  creatorEarning: number;
  creatorWalletFee: number; // 0.5% sent to claimed creator's DeSo wallet (only when claimed)
  personalToken: number;
  teamToken: number;
  leagueToken: number;
  communityPool: number;
  personalTokenBlocked: boolean; // true when creator is active_unverified — auto-buy rerouted to team/league
  isClaimed: boolean; // true when creator has claimed their profile (2.5% total fee)
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
  // Claimed creators get 2.5% total; everyone else gets 2%
  const isClaimed = creator?.claim_status === "claimed";
  const feeRate = isClaimed ? 0.025 : 0.02;

  const total = round(tradeAmountUsd * feeRate);
  const platform = round(tradeAmountUsd * 0.01);

  // Claimed creator wallet fee: 0.5% sent directly to their DeSo key
  const creatorWalletFee = isClaimed ? round(tradeAmountUsd * 0.005) : 0;
  const creatorEarning = creatorWalletFee; // surfaced in UI as creator earning

  // Token auto-buy pool: 1% unclaimed, 0.5% claimed (remaining after wallet fee)
  const remainingPool = round(total - platform - creatorWalletFee);

  // Personal token auto-buy requires explicit claim/verification to protect
  // unclaimed celebrity identities from Caldera-driven price appreciation.
  const isFullyActive = (c?: CreatorInfo | null) =>
    c?.token_status === "active_verified" ||
    c?.token_status === "claimed";

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

  let personalToken = hasPersonal ? perTier : 0;
  let teamToken = hasTeam ? perTier : 0;
  let leagueToken = hasLeague ? perTier : 0;

  if (personalBlocked && !hasPersonal) {
    const blockedShare = round(remainingPool / (tierCount + 1));
    if (hasTeam) {
      teamToken = round(teamToken + blockedShare);
    } else if (hasLeague) {
      leagueToken = round(leagueToken + blockedShare);
    }
  }

  return {
    total,
    platform,
    creatorEarning,
    creatorWalletFee,
    personalToken,
    teamToken,
    leagueToken,
    communityPool,
    personalTokenBlocked: personalBlocked,
    isClaimed,
    labels: {
      personal: creator?.deso_username ? `$${creator.deso_username}` : null,
      team: teamCreator?.deso_username ? `$${teamCreator.deso_username}` : null,
      league: leagueCreator?.deso_username ? `$${leagueCreator.deso_username}` : null,
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
