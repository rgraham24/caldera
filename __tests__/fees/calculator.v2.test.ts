/**
 * Tests for the LOCKED v2 calculator (2026-05-01).
 *
 * Covers:
 *   - flat 2.0% fee on every buy
 *   - 2-way split (1.0% platform + 1.0% creator-auto-buy)
 *   - autoBuyRecipient routing (claimed → creator_wallet, unclaimed → platform_held)
 *   - sells are always 0%
 *   - edge cases (zero amounts, negative amounts)
 *   - rounding to 8 decimal places
 */
import { describe, it, expect } from 'vitest';
import {
  calculateFees,
  FEE_RATE_TOTAL,
  FEE_RATE_PLATFORM,
  FEE_RATE_CREATOR_AUTO_BUY,
  type CreatorInfo,
} from '@/lib/fees/calculator';

// ─── Fixtures ────────────────────────────────────────────────────────

const claimedCreator: CreatorInfo = {
  id: 'creator-claimed-1',
  deso_public_key: 'BC1Y_PLATFORM_HELD_KEY',
  claimed_deso_key: 'BC1Y_USER_WALLET',
  deso_username: 'claimed_user',
  claim_status: 'claimed',
};

const unclaimedCreator: CreatorInfo = {
  id: 'creator-unclaimed-1',
  deso_public_key: 'BC1Y_PLATFORM_HELD_KEY',
  claimed_deso_key: null,
  deso_username: 'unclaimed_user',
  claim_status: 'unclaimed',
};

const pendingClaimCreator: CreatorInfo = {
  id: 'creator-pending-1',
  deso_public_key: 'BC1Y_PLATFORM_HELD_KEY',
  claimed_deso_key: null,
  deso_username: 'pending_user',
  claim_status: 'pending_claim',
};

// ─── Constants ───────────────────────────────────────────────────────

describe('Fee rate constants', () => {
  it('total fee is 2.0%', () => {
    expect(FEE_RATE_TOTAL).toBe(0.02);
  });

  it('platform share is 1.0%', () => {
    expect(FEE_RATE_PLATFORM).toBe(0.01);
  });

  it('creator-auto-buy share is 1.0%', () => {
    expect(FEE_RATE_CREATOR_AUTO_BUY).toBe(0.01);
  });

  it('the two shares sum to the total', () => {
    expect(FEE_RATE_PLATFORM + FEE_RATE_CREATOR_AUTO_BUY).toBeCloseTo(FEE_RATE_TOTAL, 10);
  });
});

// ─── Core math ───────────────────────────────────────────────────────

describe('calculateFees: core math', () => {
  it('charges 2.0% flat on a $100 buy (claimed creator)', () => {
    const f = calculateFees(100, claimedCreator, 'buy');
    expect(f.total).toBe(2);
    expect(f.platform).toBe(1);
    expect(f.creatorAutoBuy).toBe(1);
  });

  it('charges 2.0% flat on a $100 buy (unclaimed creator)', () => {
    const f = calculateFees(100, unclaimedCreator, 'buy');
    expect(f.total).toBe(2);
    expect(f.platform).toBe(1);
    expect(f.creatorAutoBuy).toBe(1);
  });

  it('two slices sum exactly to total (no drift)', () => {
    const f = calculateFees(73.51, claimedCreator, 'buy');
    expect(f.platform + f.creatorAutoBuy).toBe(f.total);
  });

  it('returns the input gross amount', () => {
    const f = calculateFees(50, claimedCreator, 'buy');
    expect(f.grossAmount).toBe(50);
  });

  it('rounds to 8 decimal places', () => {
    // 0.123 * 0.01 = 0.00123 (clean), but 0.07 * 0.01 = 0.0007000000000000001 in float
    const f = calculateFees(0.07, claimedCreator, 'buy');
    expect(f.platform).toBe(0.0007);
    expect(f.creatorAutoBuy).toBe(0.0007);
    expect(f.total).toBe(0.0014);
  });
});

// ─── autoBuyRecipient routing ────────────────────────────────────────

describe('calculateFees: autoBuyRecipient routing', () => {
  it('claimed creator with claimed_deso_key routes to creator_wallet', () => {
    const f = calculateFees(100, claimedCreator, 'buy');
    expect(f.autoBuyRecipient).toBe('creator_wallet');
  });

  it('claimed creator WITHOUT claimed_deso_key falls back to platform_held', () => {
    // Defensive — a claimed row missing the destination key is bad data,
    // and we route to platform_held to avoid sending coins to nowhere.
    const broken: CreatorInfo = { ...claimedCreator, claimed_deso_key: null };
    const f = calculateFees(100, broken, 'buy');
    expect(f.autoBuyRecipient).toBe('platform_held');
  });

  it('unclaimed creator routes to platform_held', () => {
    const f = calculateFees(100, unclaimedCreator, 'buy');
    expect(f.autoBuyRecipient).toBe('platform_held');
  });

  it('pending_claim creator routes to platform_held (not yet claimed)', () => {
    const f = calculateFees(100, pendingClaimCreator, 'buy');
    expect(f.autoBuyRecipient).toBe('platform_held');
  });

  it('passes through creator id and creator coin pubkey', () => {
    const f = calculateFees(100, claimedCreator, 'buy');
    expect(f.creatorId).toBe('creator-claimed-1');
    expect(f.creatorCoinPublicKey).toBe('BC1Y_PLATFORM_HELD_KEY');
  });
});

// ─── Sells ───────────────────────────────────────────────────────────

describe('calculateFees: sells', () => {
  it('sells are always 0%', () => {
    const f = calculateFees(100, claimedCreator, 'sell');
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
    expect(f.creatorAutoBuy).toBe(0);
  });

  it('sells preserve the input gross amount', () => {
    const f = calculateFees(100, claimedCreator, 'sell');
    expect(f.grossAmount).toBe(100);
  });

  it('sells return platform_held recipient (no transfer attempted)', () => {
    const f = calculateFees(100, claimedCreator, 'sell');
    expect(f.autoBuyRecipient).toBe('platform_held');
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────

describe('calculateFees: edge cases', () => {
  it('zero amount produces zero fees', () => {
    const f = calculateFees(0, claimedCreator, 'buy');
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
    expect(f.creatorAutoBuy).toBe(0);
  });

  it('negative amount produces zero fees (treated as no-op)', () => {
    const f = calculateFees(-10, claimedCreator, 'buy');
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
    expect(f.creatorAutoBuy).toBe(0);
  });

  it('handles tiny amounts without integer overflow', () => {
    const f = calculateFees(0.000001, claimedCreator, 'buy');
    expect(f.total).toBeGreaterThanOrEqual(0);
    expect(f.platform).toBeGreaterThanOrEqual(0);
    expect(f.creatorAutoBuy).toBeGreaterThanOrEqual(0);
  });

  it('handles very large amounts without floating-point drift', () => {
    const f = calculateFees(10_000, claimedCreator, 'buy');
    expect(f.total).toBe(200);
    expect(f.platform).toBe(100);
    expect(f.creatorAutoBuy).toBe(100);
  });
});
