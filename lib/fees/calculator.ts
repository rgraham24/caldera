/**
 * Caldera Fee Calculator — Single Source of Truth
 *
 * LOCKED TOKENOMICS (2026-04-21). See DECISIONS.md.
 *
 * Sells: always 0% (free).
 *
 * Buys: 2.5% on every market. Split:
 *   1.0%  → Platform (Caldera operations)
 *   0.5%  → Relevant-token holder rewards (accrual ledger, pull/claim model)
 *   0.5%  → Relevant-token auto-buy on DeSo (price support; NO burn)
 *   0.5%  → Creator slice
 *
 * Creator slice routing:
 *   - Claimed creator → direct payout to creator's DeSo wallet (at trade time)
 *   - Unclaimed creator → accrues in creators.unclaimed_earnings_escrow
 *     (released on claim; rolls to category holder rewards after 12mo)
 *   - No creator (crypto/pure-category markets) → folded into holderRewards
 *     (effectively 1.0% to holder rewards on those markets)
 *
 * This file is PURE MATH. No DB calls. No network. No side effects.
 * The "relevant token" is resolved elsewhere (see lib/fees/relevantToken.ts)
 * and passed into this calculator as an input.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const FEE_RATE_TOTAL = 0.025;   // 2.5% on buys
export const FEE_RATE_PLATFORM = 0.01;
export const FEE_RATE_HOLDER_REWARDS = 0.005;
export const FEE_RATE_AUTO_BUY = 0.005;
export const FEE_RATE_CREATOR_SLICE = 0.005;
export const FEE_RATE_SELL = 0;

// ─── Types ──────────────────────────────────────────────────────────

export type CreatorSliceDestination =
  | 'creator_wallet'         // claimed: pay directly to creator's DeSo wallet
  | 'escrow'                 // unclaimed creator: accrue in unclaimed_earnings_escrow
  | 'holder_rewards_topup';  // no creator (crypto/pure-category): fold into holderRewards

export type RelevantTokenType = 'category' | 'crypto' | 'creator';

export type RelevantToken = {
  type: RelevantTokenType;
  slug: string;                        // e.g. 'caldera-sports', 'bitcoin', 'dharmesh'
  deso_public_key: string | null;
  display_label: string;               // e.g. '$CalderaSports'
};

export type CreatorInfo = {
  // Legacy fields (kept for backward compat with old callers)
  tier?: string;
  deso_public_key?: string | null;
  deso_username?: string | null;
  creator_coin_price?: number;
  entity_type?: string;

  // Fields used by the new model
  id?: string;
  token_status?: string;      // shadow | active_unverified | active_verified | claimed | ...
  claim_status?: string | null; // 'unclaimed' | 'pending_claim' | 'claimed'
  claimed_deso_key?: string | null;
};

export type FeeBreakdown = {
  // ── New model (LOCKED 2026-04-21) ──
  grossAmount: number;       // input trade USD

  total: number;             // = 2.5% of gross (or 0 if gross=0)
  platform: number;          // = 1.0%
  holderRewards: number;     // = 0.5% (or 1.0% if no creator → topup)
  autoBuy: number;           // = 0.5%
  creatorSlice: number;      // = 0.5% claimed/unclaimed, 0 if no creator

  creatorSliceDestination: CreatorSliceDestination;
  creatorSlicePublicKey: string | null;  // set when destination=creator_wallet
  creatorId: string | null;              // set when destination=escrow
  isClaimed: boolean;

  relevantToken: RelevantToken | null;

  netAmount: number;         // grossAmount - total (what the user pays in)

  // ── Legacy compat fields (DO NOT REMOVE until all callers migrated) ──
  // These are derived from the new fields. They exist so downstream code
  // (app/api/trades/route.ts, components/markets/TradeTicket.tsx,
  //  hooks/useTrade.ts, components/shared/FeeBreakdown.tsx) keeps compiling
  // and running until Step 3 of the rewrite migrates them.
  totalFee: number;           // = total
  platformFee: number;        // = platform
  creatorFee: number;         // = creatorSlice if destination=creator_wallet, else 0
  creatorWalletFee: number;   // = same as creatorFee (both alias the creator_wallet slice)
  creatorEarning: number;     // = same as creatorFee (UI-facing alias)
  coinHolderPoolFee: number;  // = holderRewards + autoBuy
  marketCreatorFee: number;   // = 0 (concept removed in v2)
  escrowFee: number;          // = creatorSlice if destination=escrow, else 0

  // Tier fields — all zero in v2. Kept only so trades/route.ts buyback_events
  // insert doesn't blow up. Will be removed in Step 3.
  personalToken: 0;
  teamToken: 0;
  leagueToken: 0;
  communityPool: 0;
  personalTokenBlocked: false;
  labels: { personal: null; team: null; league: null };
};

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Calculate the fee breakdown for a single buy trade.
 *
 * @param grossAmount - trade size in USD
 * @param creator - the market's creator (null if crypto/pure-category)
 * @param relevantToken - pre-resolved token to route holder-rewards + auto-buy to
 */
export function calculateBuyFees(
  grossAmount: number,
  creator: CreatorInfo | null,
  relevantToken: RelevantToken | null
): FeeBreakdown {
  // Zero-amount fast path
  if (grossAmount <= 0) {
    return zeroFees(relevantToken);
  }

  const total = round(grossAmount * FEE_RATE_TOTAL);
  const platform = round(grossAmount * FEE_RATE_PLATFORM);
  const autoBuy = round(grossAmount * FEE_RATE_AUTO_BUY);

  // Initial slice values
  let holderRewards = round(grossAmount * FEE_RATE_HOLDER_REWARDS);
  let creatorSlice = round(grossAmount * FEE_RATE_CREATOR_SLICE);

  // Determine creator slice destination
  let destination: CreatorSliceDestination;
  let creatorSlicePublicKey: string | null = null;
  let creatorId: string | null = null;
  let isClaimed = false;

  if (creator && creator.claim_status === 'claimed') {
    destination = 'creator_wallet';
    creatorSlicePublicKey = creator.claimed_deso_key ?? creator.deso_public_key ?? null;
    isClaimed = true;
  } else if (creator) {
    destination = 'escrow';
    creatorId = creator.id ?? null;
  } else {
    // No creator at all (crypto market, pure-category market, fallback)
    // The creator slice folds into holder rewards
    destination = 'holder_rewards_topup';
    holderRewards = round(holderRewards + creatorSlice);
    creatorSlice = 0;
  }

  return {
    grossAmount,
    total,
    platform,
    holderRewards,
    autoBuy,
    creatorSlice,
    creatorSliceDestination: destination,
    creatorSlicePublicKey,
    creatorId,
    isClaimed,
    relevantToken,
    netAmount: round(grossAmount - total),

    // Legacy compat
    totalFee: total,
    platformFee: platform,
    creatorFee: destination === 'creator_wallet' ? creatorSlice : 0,
    creatorWalletFee: destination === 'creator_wallet' ? creatorSlice : 0,
    creatorEarning: destination === 'creator_wallet' ? creatorSlice : 0,
    coinHolderPoolFee: round(holderRewards + autoBuy),
    marketCreatorFee: 0,
    escrowFee: destination === 'escrow' ? creatorSlice : 0,

    // Tier fields (all zero in v2)
    personalToken: 0,
    teamToken: 0,
    leagueToken: 0,
    communityPool: 0,
    personalTokenBlocked: false,
    labels: { personal: null, team: null, league: null },
  };
}

// Sell fees are always zero
export function calculateSellFees(grossAmount: number): FeeBreakdown {
  return zeroFees(null, grossAmount);
}

// ─── Legacy wrappers (preserve old call sites, now route to new math) ──

/**
 * Legacy wrapper used by lib/fees/calculator.ts callers that still use the
 * pre-v2 signature. Internally calls calculateBuyFees.
 *
 * IMPORTANT: this wrapper does NOT attempt to resolve a relevant token,
 * because old callers didn't provide market data. Callers that upgrade
 * to pass a real relevantToken should use calculateBuyFees directly.
 */
export function calculateMarketFees(
  tradeAmountUsd: number,
  creator?: CreatorInfo | null,
  _teamCreator?: CreatorInfo | null,   // ignored in v2
  _leagueCreator?: CreatorInfo | null  // ignored in v2
): FeeBreakdown {
  return calculateBuyFees(tradeAmountUsd, creator ?? null, null);
}

export type MarketFeeType = 'standard' | 'user_created' | 'official_creator';
export type CreatorTier = 'verified_creator' | 'public_figure' | 'unclaimed' | 'claimed' | 'verified';
export type EntityType = string;

/**
 * Legacy wrapper — old signature. Translates 'claimed' tier string to
 * the new creator.claim_status = 'claimed' path.
 */
export function calculateFees(
  grossAmount: number,
  _marketType: MarketFeeType,
  _config: Record<string, string>,
  creatorTier?: CreatorTier,
  entityType?: EntityType
): FeeBreakdown {
  const creator: CreatorInfo = {
    tier: creatorTier ?? 'unclaimed',
    entity_type: entityType ?? 'individual',
    deso_public_key: null,
    creator_coin_price: 0,
    claim_status: creatorTier === 'claimed' ? 'claimed' : 'unclaimed',
  };
  return calculateBuyFees(grossAmount, creator, null);
}

export function getMarketFeeType(market: {
  creator_id: string | null;
  created_by_user_id: string | null;
}): MarketFeeType {
  if (market.creator_id) return 'official_creator';
  if (market.created_by_user_id) return 'user_created';
  return 'standard';
}

// ─── Helpers ────────────────────────────────────────────────────────

function zeroFees(
  relevantToken: RelevantToken | null,
  grossAmount: number = 0
): FeeBreakdown {
  return {
    grossAmount,
    total: 0,
    platform: 0,
    holderRewards: 0,
    autoBuy: 0,
    creatorSlice: 0,
    creatorSliceDestination: 'holder_rewards_topup',
    creatorSlicePublicKey: null,
    creatorId: null,
    isClaimed: false,
    relevantToken,
    netAmount: grossAmount,
    totalFee: 0,
    platformFee: 0,
    creatorFee: 0,
    creatorWalletFee: 0,
    creatorEarning: 0,
    coinHolderPoolFee: 0,
    marketCreatorFee: 0,
    escrowFee: 0,
    personalToken: 0,
    teamToken: 0,
    leagueToken: 0,
    communityPool: 0,
    personalTokenBlocked: false,
    labels: { personal: null, team: null, league: null },
  };
}

function round(n: number): number {
  // Round to 2 decimal places for USD.
  return Math.round(n * 100) / 100;
}
