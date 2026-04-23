/**
 * Tests for lib/fees/holderSnapshot.ts
 *
 * Covers the pure pro-rata math only. fetchAllHolders (DeSo API)
 * and snapshotHolders (DB writes) are integration-tested separately.
 */
import { describe, it, expect } from 'vitest';
import { computeHolderShares, type DesoHolder } from '@/lib/fees/holderSnapshot';

const h = (pk: string, bal: number): DesoHolder => ({
  HODLerPublicKeyBase58Check: pk,
  BalanceNanos: bal,
});

describe('computeHolderShares', () => {
  it('empty holders list → empty shares', () => {
    expect(computeHolderShares([], 1.0)).toEqual([]);
  });

  it('all holders have zero balance → empty shares', () => {
    expect(computeHolderShares([h('A', 0), h('B', 0)], 1.0)).toEqual([]);
  });

  it('single holder owns everything → gets full amount', () => {
    const shares = computeHolderShares([h('A', 1000)], 0.005);
    expect(shares).toHaveLength(1);
    expect(shares[0].holder_public_key).toBe('A');
    expect(shares[0].share_usd).toBeCloseTo(0.005, 8);
  });

  it('two holders, equal balances → split 50/50', () => {
    const shares = computeHolderShares([h('A', 500), h('B', 500)], 0.005);
    expect(shares).toHaveLength(2);
    expect(shares[0].share_usd).toBeCloseTo(0.0025, 8);
    expect(shares[1].share_usd).toBeCloseTo(0.0025, 8);
  });

  it('two holders, 80/20 split → proportional shares', () => {
    const shares = computeHolderShares([h('A', 800), h('B', 200)], 0.01);
    expect(shares[0].share_usd).toBeCloseTo(0.008, 8);
    expect(shares[1].share_usd).toBeCloseTo(0.002, 8);
  });

  it('skips holders with zero balance in a mixed list', () => {
    const shares = computeHolderShares([h('A', 500), h('B', 0), h('C', 500)], 0.005);
    expect(shares).toHaveLength(2);
    expect(shares.map(s => s.holder_public_key).sort()).toEqual(['A', 'C']);
  });

  it('truncates per-holder share (does not round up)', () => {
    // 3 holders, equal split of $0.01 → each should get ~0.00333...
    // Truncated at 8 decimals → 0.00333333, NOT 0.00333334
    const shares = computeHolderShares(
      [h('A', 100), h('B', 100), h('C', 100)],
      0.01
    );
    expect(shares).toHaveLength(3);
    shares.forEach(s => {
      expect(s.share_usd).toBe(0.00333333);
    });
  });

  it('tiny share rounds to 0 → holder is dropped from result', () => {
    // One whale + 1 shrimp. Shrimp's share is sub-microcent → dropped.
    const shares = computeHolderShares(
      [h('WHALE', 1_000_000_000), h('SHRIMP', 1)],
      0.0000001 // 0.00001 cents total
    );
    // Whale gets something, shrimp gets truncated to 0 and is dropped
    expect(shares.length).toBeLessThanOrEqual(1);
    shares.forEach(s => expect(s.share_usd).toBeGreaterThan(0));
  });

  it('slice sum never exceeds totalAmountUsd (dust is truncated, never added)', () => {
    const holders = [h('A', 333), h('B', 333), h('C', 334)];
    const shares = computeHolderShares(holders, 0.01);
    const sum = shares.reduce((acc, s) => acc + s.share_usd, 0);
    // Sum should be ≤ 0.01 (never more — we truncate)
    expect(sum).toBeLessThanOrEqual(0.01);
    // And should be "close to" 0.01 (within a microcent)
    expect(0.01 - sum).toBeLessThan(0.00000001 * holders.length);
  });

  it('pro-rata with large holder count (1000 holders)', () => {
    const holders = Array.from({ length: 1000 }, (_, i) => h(`H${i}`, 1));
    const shares = computeHolderShares(holders, 0.005);
    // Each holder gets 0.005 / 1000 = 0.000005 truncated to 0.000005
    expect(shares).toHaveLength(1000);
    shares.forEach(s => {
      expect(s.share_usd).toBe(0.000005);
    });
  });
});
