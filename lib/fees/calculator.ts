/**
 * Caldera Fee Calculator — Single Source of Truth
 *
 * LOCKED TOKENOMICS (2026-05-01). See DECISIONS.md.
 *
 * Sells: always 0% (free).
 *
 * Buys: 2.0% on every market. Split:
 *   1.0%  → Platform (Caldera operations)
 *   1.0%  → Creator coin auto-buy
 *
 * Routing for the 1% creator coin auto-buy:
 *   - Claimed creator → coins sent directly to creator's DeSo wallet on trade
 *   - Unclaimed creator → coins held in platform wallet (claim bounty)
 *
 * Every market is creator-attached in the new MVP. There are no crypto markets,
 * no category-token markets, no "relevant token" routing.
 *
 * This file is PURE MATH. No DB calls. No network. No side effects.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const FEE_RATE_TOTAL = 0.02;            // 2.0% on buys (down from 2.5%)
export const FEE_RATE_PLATFORM = 0.01;         // 1.0%
export const FEE_RATE_CREATOR_AUTO_BUY = 0.01; // 1.0%
export const FEE_RATE_SELL = 0;

// ─── Types ──────────────────────────────────────────────────────────

export type CreatorInfo = {
  id: string;
  deso_public_key: string | null;
  deso_username?: string | null;
  claim_status: 'unclaimed' | 'pending_claim' | 'claimed';
  claimed_deso_key: string | null;
};

export type FeeBreakdown = {
  grossAmount: number;
  total: number;
  platform: number;
  creatorAutoBuy: number;
  creatorId: string;
  creatorCoinPublicKey: string | null;
  autoBuyRecipient: 'creator_wallet' | 'platform_held';
};

// ─── Calculator ─────────────────────────────────────────────────────

export function calculateFees(
  grossAmountUsd: number,
  creator: CreatorInfo,
  side: 'buy' | 'sell',
): FeeBreakdown {
  if (side === 'sell' || grossAmountUsd <= 0) {
    return {
      grossAmount: grossAmountUsd,
      total: 0,
      platform: 0,
      creatorAutoBuy: 0,
      creatorId: creator.id,
      creatorCoinPublicKey: creator.deso_public_key,
      autoBuyRecipient: 'platform_held',
    };
  }

  const total = round8(grossAmountUsd * FEE_RATE_TOTAL);
  const platform = round8(grossAmountUsd * FEE_RATE_PLATFORM);
  const creatorAutoBuy = round8(total - platform);

  const isClaimed = creator.claim_status === 'claimed' && !!creator.claimed_deso_key;

  return {
    grossAmount: grossAmountUsd,
    total,
    platform,
    creatorAutoBuy,
    creatorId: creator.id,
    creatorCoinPublicKey: creator.deso_public_key,
    autoBuyRecipient: isClaimed ? 'creator_wallet' : 'platform_held',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
