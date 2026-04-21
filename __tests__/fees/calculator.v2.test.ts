/**
 * Tests for the LOCKED v2 calculator (2026-04-21).
 *
 * Covers:
 *   - flat 2.5% fee on every market
 *   - 4-way split (1% + 0.5% + 0.5% + 0.5%)
 *   - creator slice routing (claimed / unclaimed / no-creator)
 *   - legacy compat field derivations
 *   - edge cases (zero amounts, missing inputs)
 */
import { describe, it, expect } from 'vitest';
import {
  calculateBuyFees,
  calculateSellFees,
  calculateMarketFees,
  calculateFees,
  getMarketFeeType,
  type CreatorInfo,
  type RelevantToken,
} from '@/lib/fees/calculator';

// ─── Fixtures ────────────────────────────────────────────────────────

const claimedCreator: CreatorInfo = {
  id: 'creator-claimed-1',
  deso_public_key: 'BC1Y_CLAIMED_PUBKEY',
  claimed_deso_key: 'BC1Y_CLAIMED_PUBKEY',
  deso_username: 'claimed_user',
  token_status: 'claimed',
  claim_status: 'claimed',
};

const unclaimedCreator: CreatorInfo = {
  id: 'creator-unclaimed-1',
  deso_public_key: 'BC1Y_UNCLAIMED_PUBKEY',
  deso_username: 'unclaimed_user',
  token_status: 'active_unverified',
  claim_status: 'unclaimed',
};

const categoryToken: RelevantToken = {
  type: 'category',
  slug: 'caldera-sports',
  deso_public_key: 'BC1Y_CATEGORY_SPORTS',
  display_label: '$CalderaSports',
};

const cryptoToken: RelevantToken = {
  type: 'crypto',
  slug: 'bitcoin',
  deso_public_key: 'BC1Y_BITCOIN',
  display_label: '$Bitcoin',
};

// ─── Core rates ──────────────────────────────────────────────────────

describe('calculateBuyFees: core rates', () => {
  it('charges 2.5% flat on every market (claimed)', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.total).toBe(2.5);
  });

  it('charges 2.5% flat on every market (unclaimed)', () => {
    const f = calculateBuyFees(100, unclaimedCreator, categoryToken);
    expect(f.total).toBe(2.5);
  });

  it('charges 2.5% flat on crypto markets (no creator)', () => {
    const f = calculateBuyFees(100, null, cryptoToken);
    expect(f.total).toBe(2.5);
  });

  it('routes 1% to platform on every market', () => {
    expect(calculateBuyFees(100, claimedCreator, categoryToken).platform).toBe(1);
    expect(calculateBuyFees(100, unclaimedCreator, categoryToken).platform).toBe(1);
    expect(calculateBuyFees(100, null, cryptoToken).platform).toBe(1);
  });

  it('routes 0.5% to auto-buy on every market', () => {
    expect(calculateBuyFees(100, claimedCreator, categoryToken).autoBuy).toBe(0.5);
    expect(calculateBuyFees(100, unclaimedCreator, categoryToken).autoBuy).toBe(0.5);
    expect(calculateBuyFees(100, null, cryptoToken).autoBuy).toBe(0.5);
  });

  it('sells are always 0%', () => {
    const f = calculateSellFees(100);
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
    expect(f.holderRewards).toBe(0);
    expect(f.autoBuy).toBe(0);
    expect(f.creatorSlice).toBe(0);
  });

  it('zero-amount trades produce zero fees', () => {
    const f = calculateBuyFees(0, claimedCreator, categoryToken);
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
    expect(f.holderRewards).toBe(0);
  });

  it('$1 unclaimed-crypto trade: slices sum exactly to total (no rounding drift)', () => {
    const creator: CreatorInfo = {
      id: 'c1', claim_status: 'unclaimed', token_status: 'active_unverified',
    };
    const token: RelevantToken = {
      type: 'crypto', slug: 'bitcoin',
      deso_public_key: 'BC1YTEST', display_label: '$Bitcoin',
    };
    const f = calculateBuyFees(1, creator, token);

    expect(f.total).toBe(0.025);
    expect(f.platform).toBe(0.01);
    expect(f.holderRewards).toBe(0.005);
    expect(f.autoBuy).toBe(0.005);
    expect(f.creatorSlice).toBe(0.005);

    // The critical check: sum of slices === total, no drift
    const sum = f.platform + f.holderRewards + f.autoBuy + f.creatorSlice;
    expect(sum).toBeCloseTo(f.total, 10);
  });
});

// ─── Claimed creator routing ─────────────────────────────────────────

describe('calculateBuyFees: claimed creator routing', () => {
  it('sends 0.5% to the creator wallet', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.creatorSlice).toBe(0.5);
    expect(f.creatorSliceDestination).toBe('creator_wallet');
    expect(f.creatorSlicePublicKey).toBe('BC1Y_CLAIMED_PUBKEY');
    expect(f.isClaimed).toBe(true);
  });

  it('sends 0.5% to holderRewards (not 1%)', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.holderRewards).toBe(0.5);
  });

  it('falls back to deso_public_key if claimed_deso_key missing', () => {
    const creator = { ...claimedCreator, claimed_deso_key: null };
    const f = calculateBuyFees(100, creator, categoryToken);
    expect(f.creatorSlicePublicKey).toBe('BC1Y_CLAIMED_PUBKEY');
  });

  it('creatorId is null when destination=creator_wallet', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.creatorId).toBeNull();
  });
});

// ─── Unclaimed creator routing (→ escrow) ────────────────────────────

describe('calculateBuyFees: unclaimed creator routing', () => {
  it('sends 0.5% to escrow', () => {
    const f = calculateBuyFees(100, unclaimedCreator, categoryToken);
    expect(f.creatorSlice).toBe(0.5);
    expect(f.creatorSliceDestination).toBe('escrow');
    expect(f.creatorId).toBe('creator-unclaimed-1');
    expect(f.isClaimed).toBe(false);
  });

  it('sends 0.5% to holderRewards (not 1%)', () => {
    const f = calculateBuyFees(100, unclaimedCreator, categoryToken);
    expect(f.holderRewards).toBe(0.5);
  });

  it('creatorSlicePublicKey is null when destination=escrow', () => {
    const f = calculateBuyFees(100, unclaimedCreator, categoryToken);
    expect(f.creatorSlicePublicKey).toBeNull();
  });
});

// ─── No-creator routing (crypto + pure-category) ─────────────────────

describe('calculateBuyFees: no-creator routing (holder_rewards_topup)', () => {
  it('folds the creator slice into holderRewards → 1.0% total to holders', () => {
    const f = calculateBuyFees(100, null, cryptoToken);
    expect(f.holderRewards).toBe(1.0);
    expect(f.creatorSlice).toBe(0);
  });

  it('destination is holder_rewards_topup', () => {
    const f = calculateBuyFees(100, null, cryptoToken);
    expect(f.creatorSliceDestination).toBe('holder_rewards_topup');
  });

  it('no creator fields populated', () => {
    const f = calculateBuyFees(100, null, cryptoToken);
    expect(f.creatorSlicePublicKey).toBeNull();
    expect(f.creatorId).toBeNull();
    expect(f.isClaimed).toBe(false);
  });

  it('slices still sum to total', () => {
    const f = calculateBuyFees(100, null, cryptoToken);
    const sum = f.platform + f.holderRewards + f.autoBuy + f.creatorSlice;
    expect(sum).toBe(f.total);
  });
});

// ─── Slice sums ──────────────────────────────────────────────────────

describe('calculateBuyFees: slice sums', () => {
  it('all 4 slices sum exactly to total (claimed)', () => {
    const f = calculateBuyFees(250, claimedCreator, categoryToken);
    const sum = f.platform + f.holderRewards + f.autoBuy + f.creatorSlice;
    expect(sum).toBe(f.total);
  });

  it('all 4 slices sum exactly to total (unclaimed)', () => {
    const f = calculateBuyFees(250, unclaimedCreator, categoryToken);
    const sum = f.platform + f.holderRewards + f.autoBuy + f.creatorSlice;
    expect(sum).toBe(f.total);
  });

  it('all 4 slices sum exactly to total (no creator)', () => {
    const f = calculateBuyFees(250, null, cryptoToken);
    const sum = f.platform + f.holderRewards + f.autoBuy + f.creatorSlice;
    expect(sum).toBe(f.total);
  });
});

// ─── Legacy compat fields ────────────────────────────────────────────

describe('FeeBreakdown: legacy compat fields', () => {
  it('totalFee === total, platformFee === platform', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.totalFee).toBe(f.total);
    expect(f.platformFee).toBe(f.platform);
  });

  it('creatorFee === creatorSlice when claimed', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.creatorFee).toBe(0.5);
    expect(f.creatorWalletFee).toBe(0.5);
    expect(f.creatorEarning).toBe(0.5);
  });

  it('creatorFee is zero when unclaimed (creator slice is in escrow)', () => {
    const f = calculateBuyFees(100, unclaimedCreator, categoryToken);
    expect(f.creatorFee).toBe(0);
    expect(f.escrowFee).toBe(0.5);
  });

  it('coinHolderPoolFee === holderRewards + autoBuy', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.coinHolderPoolFee).toBe(f.holderRewards + f.autoBuy);
  });

  it('marketCreatorFee is always 0 in v2', () => {
    expect(calculateBuyFees(100, claimedCreator, categoryToken).marketCreatorFee).toBe(0);
    expect(calculateBuyFees(100, unclaimedCreator, categoryToken).marketCreatorFee).toBe(0);
    expect(calculateBuyFees(100, null, cryptoToken).marketCreatorFee).toBe(0);
  });

  it('tier fields are all zero', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.personalToken).toBe(0);
    expect(f.teamToken).toBe(0);
    expect(f.leagueToken).toBe(0);
    expect(f.communityPool).toBe(0);
    expect(f.personalTokenBlocked).toBe(false);
  });

  it('netAmount === grossAmount - total', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.netAmount).toBe(100 - 2.5);
  });
});

// ─── Legacy wrappers still work ──────────────────────────────────────

describe('Legacy wrappers', () => {
  it('calculateMarketFees (no relevantToken) still returns sane fees', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.total).toBe(2.5);
    expect(f.platform).toBe(1);
    expect(f.creatorSlice).toBe(0.5);
  });

  it('calculateFees with tier=claimed routes creator slice to wallet', () => {
    const f = calculateFees(100, 'official_creator', {}, 'claimed', 'individual');
    expect(f.creatorSliceDestination).toBe('creator_wallet');
    expect(f.creatorSlice).toBe(0.5);
  });

  it('calculateFees with tier=unclaimed routes creator slice to escrow', () => {
    const f = calculateFees(100, 'standard', {}, 'unclaimed', 'individual');
    expect(f.creatorSliceDestination).toBe('escrow');
    expect(f.escrowFee).toBe(0.5);
  });

  it('getMarketFeeType still classifies correctly', () => {
    expect(getMarketFeeType({ creator_id: 'c-1', created_by_user_id: null })).toBe('official_creator');
    expect(getMarketFeeType({ creator_id: null, created_by_user_id: 'u-1' })).toBe('user_created');
    expect(getMarketFeeType({ creator_id: null, created_by_user_id: null })).toBe('standard');
  });
});

// ─── Relevant token pass-through ─────────────────────────────────────

describe('calculateBuyFees: relevantToken is preserved', () => {
  it('returns the relevantToken input on the breakdown', () => {
    const f = calculateBuyFees(100, claimedCreator, categoryToken);
    expect(f.relevantToken).toEqual(categoryToken);
  });

  it('returns null when no relevantToken provided', () => {
    const f = calculateBuyFees(100, claimedCreator, null);
    expect(f.relevantToken).toBeNull();
  });
});
