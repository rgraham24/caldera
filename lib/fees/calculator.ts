export type FeeBreakdown = {
  grossAmount: number;
  platformFee: number;
  creatorFee: number;
  coinHolderPoolFee: number;
  escrowFee: number;
  marketCreatorFee: number;
  totalFee: number;
  netAmount: number;
};

export type MarketFeeType = "standard" | "user_created" | "official_creator";
export type CreatorTier = "verified_creator" | "public_figure" | "unclaimed";

/**
 * Fee logic by creator tier:
 * - verified_creator: platform 1.5%, creator 0.75%, holders 0.75% = 3.0%
 * - public_figure: platform 1.5%, creator 0% (→holders), holders 1.5% = 3.0%
 * - unclaimed: platform 1.5%, escrow 0.75%, holders 0.75% = 3.0%
 */
export function calculateFees(
  grossAmount: number,
  marketType: MarketFeeType,
  config: Record<string, string>,
  creatorTier?: CreatorTier
): FeeBreakdown {
  let platformRate = 0;
  let creatorRate = 0;
  let coinHolderPoolRate = 0;
  let escrowRate = 0;
  let marketCreatorRate = 0;

  switch (marketType) {
    case "standard":
      platformRate = parseFloat(config.standard_platform_fee || "0.02");
      break;
    case "user_created":
      platformRate = parseFloat(config.user_market_platform_fee || "0.015");
      marketCreatorRate = parseFloat(config.user_market_creator_fee || "0.005");
      break;
    case "official_creator": {
      platformRate = parseFloat(config.creator_market_platform_fee || "0.015");
      const tier = creatorTier || "verified_creator";
      if (tier === "verified_creator") {
        creatorRate = 0.0075;
        coinHolderPoolRate = 0.0075;
      } else if (tier === "public_figure") {
        coinHolderPoolRate = 0.015;
      } else {
        // unclaimed — escrow the creator share
        escrowRate = 0.0075;
        coinHolderPoolRate = 0.0075;
      }
      break;
    }
  }

  const platformFee = round(grossAmount * platformRate);
  const creatorFee = round(grossAmount * creatorRate);
  const coinHolderPoolFee = round(grossAmount * coinHolderPoolRate);
  const escrowFee = round(grossAmount * escrowRate);
  const marketCreatorFee = round(grossAmount * marketCreatorRate);
  const totalFee = round(platformFee + creatorFee + coinHolderPoolFee + escrowFee + marketCreatorFee);

  return {
    grossAmount,
    platformFee,
    creatorFee,
    coinHolderPoolFee,
    escrowFee,
    marketCreatorFee,
    totalFee,
    netAmount: round(grossAmount - totalFee),
  };
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
