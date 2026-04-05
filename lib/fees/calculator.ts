export type FeeBreakdown = {
  grossAmount: number;
  platformFee: number;
  creatorFee: number;
  coinHolderPoolFee: number;
  marketCreatorFee: number;
  totalFee: number;
  netAmount: number;
};

export type MarketFeeType = "standard" | "user_created" | "official_creator";

/**
 * Fee logic (all markets now require a creator):
 * - Platform: 1.5%
 * - Creator: 0.75%
 * - Coin holder pool: 0.75%
 * - Total: 3.0%
 *
 * Fallback for legacy/standard markets: platform 2.0%
 */
export function calculateFees(
  grossAmount: number,
  marketType: MarketFeeType,
  config: Record<string, string>
): FeeBreakdown {
  let platformRate = 0;
  let creatorRate = 0;
  let coinHolderPoolRate = 0;
  let marketCreatorRate = 0;

  switch (marketType) {
    case "standard":
      platformRate = parseFloat(config.standard_platform_fee || "0.02");
      break;
    case "user_created":
      platformRate = parseFloat(config.user_market_platform_fee || "0.015");
      marketCreatorRate = parseFloat(config.user_market_creator_fee || "0.005");
      break;
    case "official_creator":
      platformRate = parseFloat(config.creator_market_platform_fee || "0.015");
      creatorRate = parseFloat(config.creator_market_creator_fee || "0.0075");
      coinHolderPoolRate = parseFloat(config.creator_market_coin_holder_fee || "0.0075");
      break;
  }

  const platformFee = round(grossAmount * platformRate);
  const creatorFee = round(grossAmount * creatorRate);
  const coinHolderPoolFee = round(grossAmount * coinHolderPoolRate);
  const marketCreatorFee = round(grossAmount * marketCreatorRate);
  const totalFee = round(platformFee + creatorFee + coinHolderPoolFee + marketCreatorFee);

  return {
    grossAmount,
    platformFee,
    creatorFee,
    coinHolderPoolFee,
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
