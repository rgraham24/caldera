/**
 * CHARACTERIZATION TESTS for lib/fees/calculator.ts (PRE-REWRITE)
 *
 * These tests document what the calculator did BEFORE the tokenomics-v2 rewrite.
 * ALL SUITES ARE SKIPPED as of 2026-04-21 — the rewrite changed behavior as
 * intended and these tests would now fail by design.
 *
 * This file is kept as historical documentation of the old 2%/2.5%
 * tier-routing model. Do not delete it; do not unskip it.
 *
 * See calculator.v2.test.ts for the authoritative active test suite.
 */
// All suites below are skipped. See calculator.v2.test.ts for the active tests.
import { describe, it, expect } from 'vitest';
import {
  calculateMarketFees,
  calculateFees,
  getMarketFeeType,
  type CreatorInfo,
  type FeeBreakdown,
} from '@/lib/fees/calculator';

// ─── Helpers ─────────────────────────────────────────────────────────

const claimedCreator: CreatorInfo = {
  tier: 'claimed',
  deso_public_key: 'BC1YLTEST_CLAIMED_PUBKEY',
  deso_username: 'claimedcreator',
  creator_coin_price: 100,
  entity_type: 'individual',
  token_status: 'claimed',
  claim_status: 'claimed',
};

const verifiedCreator: CreatorInfo = {
  tier: 'verified',
  deso_public_key: 'BC1YLTEST_VERIFIED_PUBKEY',
  deso_username: 'verifiedcreator',
  creator_coin_price: 100,
  entity_type: 'individual',
  token_status: 'active_verified',
  claim_status: 'unclaimed',
};

const unverifiedCreator: CreatorInfo = {
  tier: 'unverified',
  deso_public_key: 'BC1YLTEST_UNVERIFIED_PUBKEY',
  deso_username: 'unverifiedcreator',
  creator_coin_price: 100,
  entity_type: 'individual',
  token_status: 'active_unverified',
  claim_status: 'unclaimed',
};

const teamCreator: CreatorInfo = {
  tier: 'team',
  deso_public_key: 'BC1YLTEST_TEAM_PUBKEY',
  deso_username: 'lakers',
  creator_coin_price: 50,
  entity_type: 'team',
  token_status: 'active_unverified',
};

const leagueCreator: CreatorInfo = {
  tier: 'league',
  deso_public_key: 'BC1YLTEST_LEAGUE_PUBKEY',
  deso_username: 'nba',
  creator_coin_price: 75,
  entity_type: 'league',
  token_status: 'active_unverified',
};

// ─── calculateMarketFees — basic fee rates ───────────────────────────

describe.skip('calculateMarketFees: fee rates', () => {
  it('charges 2% on unclaimed creators', () => {
    const f = calculateMarketFees(100, unverifiedCreator);
    expect(f.total).toBe(2);
    expect(f.isClaimed).toBe(false);
  });

  it('charges 2.5% on claimed creators', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.total).toBe(2.5);
    expect(f.isClaimed).toBe(true);
  });

  it('always sends 1% to platform', () => {
    const claimed = calculateMarketFees(100, claimedCreator);
    const unclaimed = calculateMarketFees(100, unverifiedCreator);
    expect(claimed.platform).toBe(1);
    expect(unclaimed.platform).toBe(1);
  });

  it('charges no fee on zero-value trades', () => {
    const f = calculateMarketFees(0, claimedCreator);
    expect(f.total).toBe(0);
    expect(f.platform).toBe(0);
  });
});

// ─── Claimed creator routing ─────────────────────────────────────────

describe.skip('calculateMarketFees: claimed creator routing', () => {
  it('routes 0.5% to the claimed creator wallet', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.creatorWalletFee).toBe(0.5);
    expect(f.creatorEarning).toBe(0.5);
  });

  it('remainingPool for claimed = 1.0% (after platform + creator wallet)', () => {
    const f = calculateMarketFees(100, claimedCreator);
    // total 2.5 - platform 1 - creator wallet 0.5 = 1.0 remaining
    const remaining = f.total - f.platform - f.creatorWalletFee;
    expect(remaining).toBe(1);
  });
});

// ─── Unclaimed (unverified) creator routing ──────────────────────────

describe.skip('calculateMarketFees: unverified creator routing', () => {
  it('does not route to creator wallet', () => {
    const f = calculateMarketFees(100, unverifiedCreator);
    expect(f.creatorWalletFee).toBe(0);
    expect(f.creatorEarning).toBe(0);
  });

  it('marks personal token as BLOCKED for unverified with coin price', () => {
    const f = calculateMarketFees(100, unverifiedCreator);
    expect(f.personalTokenBlocked).toBe(true);
    expect(f.personalToken).toBe(0);
  });

  it('routes the entire non-platform pool to community when no tokens active', () => {
    const f = calculateMarketFees(100, unverifiedCreator);
    // 1% non-platform, no team, no league, personal blocked → all to community
    expect(f.communityPool).toBe(1);
    expect(f.teamToken).toBe(0);
    expect(f.leagueToken).toBe(0);
  });
});

// ─── Verified (active_verified) creator ──────────────────────────────

describe.skip('calculateMarketFees: active_verified creator routing', () => {
  it('does NOT send wallet fee (only claimed does)', () => {
    const f = calculateMarketFees(100, verifiedCreator);
    expect(f.creatorWalletFee).toBe(0);
  });

  it('routes personal token (no block) when coin price > 0', () => {
    const f = calculateMarketFees(100, verifiedCreator);
    expect(f.personalTokenBlocked).toBe(false);
    expect(f.personalToken).toBeGreaterThan(0);
  });
});

// ─── Multi-tier routing (creator + team + league) ────────────────────

describe.skip('calculateMarketFees: multi-tier routing', () => {
  it('splits pool across personal + team + league when all active', () => {
    const f = calculateMarketFees(300, verifiedCreator, teamCreator, leagueCreator);
    // total 6, platform 3, remaining 3 → 1 each
    expect(f.personalToken).toBe(1);
    expect(f.teamToken).toBe(1);
    expect(f.leagueToken).toBe(1);
    expect(f.communityPool).toBe(0);
  });

  it('with unverified creator (blocked), reroutes blocked share to team', () => {
    const f = calculateMarketFees(300, unverifiedCreator, teamCreator, leagueCreator);
    // personal blocked — its share distributed to team/league
    expect(f.personalToken).toBe(0);
    expect(f.personalTokenBlocked).toBe(true);
    // team and league both get something non-zero
    expect(f.teamToken).toBeGreaterThan(0);
    expect(f.leagueToken).toBeGreaterThan(0);
  });

  it('no creators provided → all to community pool', () => {
    const f = calculateMarketFees(100, null);
    expect(f.communityPool).toBe(1);
    expect(f.personalToken).toBe(0);
    expect(f.teamToken).toBe(0);
    expect(f.leagueToken).toBe(0);
  });
});

// ─── Legacy wrapper calculateFees() ──────────────────────────────────

describe.skip('calculateFees (legacy wrapper): always routes to community', () => {
  it('zeros out personal/team/league regardless of input tier', () => {
    const f = calculateFees(100, 'official_creator', {}, 'verified_creator', 'individual');
    // Legacy wrapper zeros coin_price, so no tier qualifies
    expect(f.personalToken).toBe(0);
    expect(f.teamToken).toBe(0);
    expect(f.leagueToken).toBe(0);
    expect(f.communityPool).toBeGreaterThan(0);
  });

  it('returns 2% total by default (tier=unclaimed path)', () => {
    const f = calculateFees(100, 'standard', {}, 'unclaimed', 'individual');
    expect(f.total).toBe(2);
  });
});

// ─── getMarketFeeType classification ─────────────────────────────────

describe.skip('getMarketFeeType', () => {
  it('returns official_creator when creator_id is set', () => {
    expect(getMarketFeeType({ creator_id: 'c-1', created_by_user_id: null })).toBe('official_creator');
  });

  it('returns user_created when only user id is set', () => {
    expect(getMarketFeeType({ creator_id: null, created_by_user_id: 'u-1' })).toBe('user_created');
  });

  it('returns standard otherwise', () => {
    expect(getMarketFeeType({ creator_id: null, created_by_user_id: null })).toBe('standard');
  });
});

// ─── Legacy compat fields on FeeBreakdown ────────────────────────────

describe.skip('FeeBreakdown: legacy compat fields', () => {
  it('exposes totalFee === total, platformFee === platform', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.totalFee).toBe(f.total);
    expect(f.platformFee).toBe(f.platform);
  });

  it('exposes creatorFee === creatorEarning', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.creatorFee).toBe(f.creatorEarning);
  });

  it('coinHolderPoolFee === sum of personal/team/league', () => {
    const f = calculateMarketFees(300, verifiedCreator, teamCreator, leagueCreator);
    expect(f.coinHolderPoolFee).toBe(f.personalToken + f.teamToken + f.leagueToken);
  });

  it('netAmount === gross - total', () => {
    const f = calculateMarketFees(100, claimedCreator);
    expect(f.netAmount).toBe(100 - f.total);
  });
});
