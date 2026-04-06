/**
 * $CALDRA Bonding Curve Engine
 *
 * Uses a reserve-ratio bonding curve (same model as DeSo creator coins).
 * Reserve ratio: 33.33% (1/3)
 * Price = Reserve / (Supply × ReserveRatio)
 *
 * Starting price: $0.01
 */

const RESERVE_RATIO = 1 / 3;

export type CaldraState = {
  totalSupplyNanos: number;
  reserveBalanceUsd: number;
  priceUsd: number;
};

/**
 * Calculate tokens received for a USD buy
 */
export function calculateBuy(
  state: CaldraState,
  usdAmount: number
): {
  tokensReceivedNanos: number;
  newPrice: number;
  newSupplyNanos: number;
  newReserve: number;
} {
  const newReserve = state.reserveBalanceUsd + usdAmount;

  // Supply formula: S_new = S_old × (R_new / R_old) ^ (1/ReserveRatio)
  // For empty state, bootstrap with initial price
  if (state.totalSupplyNanos === 0 || state.reserveBalanceUsd === 0) {
    const tokensNanos = Math.floor((usdAmount / 0.01) * 1e9);
    const newSupply = tokensNanos;
    const newPrice =
      newSupply > 0
        ? newReserve / ((newSupply / 1e9) * RESERVE_RATIO)
        : 0.01;
    return {
      tokensReceivedNanos: tokensNanos,
      newPrice: Math.round(newPrice * 10000) / 10000,
      newSupplyNanos: newSupply,
      newReserve,
    };
  }

  const ratio = newReserve / state.reserveBalanceUsd;
  const exponent = 1 / RESERVE_RATIO; // 3
  const newSupplyNanos = Math.floor(
    state.totalSupplyNanos * Math.pow(ratio, exponent)
  );
  const tokensReceivedNanos = newSupplyNanos - state.totalSupplyNanos;
  const newPrice =
    newReserve / ((newSupplyNanos / 1e9) * RESERVE_RATIO);

  return {
    tokensReceivedNanos,
    newPrice: Math.round(newPrice * 10000) / 10000,
    newSupplyNanos,
    newReserve,
  };
}

/**
 * Calculate USD received for a token sell
 */
export function calculateSell(
  state: CaldraState,
  tokenAmountNanos: number
): {
  usdReceived: number;
  newPrice: number;
  newSupplyNanos: number;
  newReserve: number;
} {
  if (tokenAmountNanos >= state.totalSupplyNanos) {
    return {
      usdReceived: state.reserveBalanceUsd,
      newPrice: 0.01,
      newSupplyNanos: 0,
      newReserve: 0,
    };
  }

  const newSupplyNanos = state.totalSupplyNanos - tokenAmountNanos;
  const ratio = newSupplyNanos / state.totalSupplyNanos;
  const exponent = RESERVE_RATIO; // 1/3
  const newReserve = state.reserveBalanceUsd * Math.pow(ratio, 1 / exponent);
  const usdReceived = state.reserveBalanceUsd - newReserve;
  const newPrice =
    newSupplyNanos > 0
      ? newReserve / ((newSupplyNanos / 1e9) * RESERVE_RATIO)
      : 0.01;

  return {
    usdReceived: Math.round(usdReceived * 100) / 100,
    newPrice: Math.round(newPrice * 10000) / 10000,
    newSupplyNanos,
    newReserve: Math.round(newReserve * 100) / 100,
  };
}
