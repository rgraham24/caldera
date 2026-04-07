// Constant Product AMM (x * y = k) for binary markets

export type AMMState = {
  yesPool: number;
  noPool: number;
};

export type TradeQuote = {
  side: "yes" | "no";
  inputAmount: number;
  sharesReceived: number;
  avgFillPrice: number;
  priceImpact: number;
  newYesPrice: number;
  newNoPrice: number;
  estimatedPayout: number;
  newYesPool: number;
  newNoPool: number;
};

/**
 * Calculate current prices from pool state
 */
export function getPrices(state: AMMState): {
  yesPrice: number;
  noPrice: number;
} {
  const total = state.yesPool + state.noPool;
  return {
    yesPrice: state.noPool / total,
    noPrice: state.yesPool / total,
  };
}

/**
 * Calculate a trade quote for buying shares
 *
 * When buying YES shares with amount $X:
 * - The user puts X into the NO pool
 * - k = yesPool * noPool (constant)
 * - new_yes_pool = k / (noPool + X)
 * - shares_received = yesPool - new_yes_pool
 */
export function getTradeQuote(
  state: AMMState,
  side: "yes" | "no",
  inputAmount: number
): TradeQuote {
  if (inputAmount <= 0) {
    throw new Error("Input amount must be positive");
  }

  const k = state.yesPool * state.noPool;
  const currentPrices = getPrices(state);

  let newYesPool: number;
  let newNoPool: number;
  let sharesReceived: number;

  if (side === "yes") {
    // FPMM: $1 = 1 YES + 1 NO share (minting)
    // User mints inputAmount YES+NO, adds NO to pool, keeps YES from pool + minted YES
    newNoPool = state.noPool + inputAmount;
    newYesPool = k / newNoPool;
    sharesReceived = inputAmount + (state.yesPool - newYesPool);
  } else {
    // FPMM: user mints inputAmount YES+NO, adds YES to pool, keeps NO from pool + minted NO
    newYesPool = state.yesPool + inputAmount;
    newNoPool = k / newYesPool;
    sharesReceived = inputAmount + (state.noPool - newNoPool);
  }

  const avgFillPrice = inputAmount / sharesReceived;
  const spotPrice = side === "yes" ? currentPrices.yesPrice : currentPrices.noPrice;
  const priceImpact = ((avgFillPrice - spotPrice) / spotPrice) * 100;

  const total = newYesPool + newNoPool;
  const newYesPrice = newNoPool / total;
  const newNoPrice = newYesPool / total;

  // If you hold YES shares and YES wins, each share pays out $1
  const estimatedPayout = sharesReceived;

  return {
    side,
    inputAmount,
    sharesReceived,
    avgFillPrice,
    priceImpact,
    newYesPrice,
    newNoPrice,
    estimatedPayout,
    newYesPool,
    newNoPool,
  };
}

/**
 * Calculate a sell quote — selling shares back to the pool
 *
 * When selling YES shares:
 * - Shares go back into the YES pool
 * - User receives $ from the NO pool
 */
export function getSellQuote(
  state: AMMState,
  side: "yes" | "no",
  sharesToSell: number
): {
  outputAmount: number;
  avgSellPrice: number;
  newYesPool: number;
  newNoPool: number;
  newYesPrice: number;
  newNoPrice: number;
} {
  if (sharesToSell <= 0) {
    throw new Error("Shares to sell must be positive");
  }

  const k = state.yesPool * state.noPool;

  let newYesPool: number;
  let newNoPool: number;
  let outputAmount: number;

  if (side === "yes") {
    // Selling YES shares: shares go back into YES pool, user gets $ from NO pool
    newYesPool = state.yesPool + sharesToSell;
    newNoPool = k / newYesPool;
    outputAmount = state.noPool - newNoPool;
  } else {
    // Selling NO shares: shares go back into NO pool, user gets $ from YES pool
    newNoPool = state.noPool + sharesToSell;
    newYesPool = k / newNoPool;
    outputAmount = state.yesPool - newYesPool;
  }

  const avgSellPrice = outputAmount / sharesToSell;
  const total = newYesPool + newNoPool;

  return {
    outputAmount,
    avgSellPrice,
    newYesPool,
    newNoPool,
    newYesPrice: newNoPool / total,
    newNoPrice: newYesPool / total,
  };
}
