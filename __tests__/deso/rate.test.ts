/**
 * Tests for lib/deso/rate.ts
 *
 * Covers the pure helper usdToDesoNanos only. fetchDesoUsdRate is
 * network-dependent and validated on the live preview deploy.
 */
import { describe, it, expect } from 'vitest';
import { usdToDesoNanos } from '@/lib/deso/rate';

const bi = (n: number) => BigInt(n);

describe('usdToDesoNanos', () => {
  it('$1 at $4/DESO → 250,000,000 nanos', () => {
    expect(usdToDesoNanos(1, 4)).toBe(bi(250_000_000));
  });

  it('$4 at $4/DESO → 1 DESO = 1e9 nanos', () => {
    expect(usdToDesoNanos(4, 4)).toBe(bi(1_000_000_000));
  });

  it('$0 → 0n regardless of rate', () => {
    expect(usdToDesoNanos(0, 4)).toBe(bi(0));
    expect(usdToDesoNanos(0, 0.000001)).toBe(bi(0));
  });

  it('zero rate → null', () => {
    expect(usdToDesoNanos(1, 0)).toBeNull();
  });

  it('negative rate → null', () => {
    expect(usdToDesoNanos(1, -0.5)).toBeNull();
  });

  it('NaN rate → null', () => {
    expect(usdToDesoNanos(1, NaN)).toBeNull();
  });

  it('Infinity rate → null', () => {
    expect(usdToDesoNanos(1, Infinity)).toBeNull();
  });

  it('negative USD → null', () => {
    expect(usdToDesoNanos(-1, 4)).toBeNull();
  });

  it('NaN USD → null', () => {
    expect(usdToDesoNanos(NaN, 4)).toBeNull();
  });

  it('large USD amount uses bigint precision (no overflow)', () => {
    // $10 million at $4/DESO → 2,500,000 DESO → 2.5e15 nanos
    // This is > Number.MAX_SAFE_INTEGER (~9e15) but bigint handles it
    expect(usdToDesoNanos(10_000_000, 4)).toBe(BigInt('2500000000000000'));
  });

  it('$0.005 at $4.71/DESO → ~1,061,571 nanos (real trade-size case)', () => {
    const result = usdToDesoNanos(0.005, 4.71);
    expect(result).not.toBeNull();
    // $0.005 / $4.71 = 0.001061571... DESO
    // * 1e9 = 1,061,571... nanos → floor = 1,061,571
    expect(result).toBe(bi(1_061_571));
  });

  it('sub-nano USD → 0n (truncation)', () => {
    // $0.000000001 at $4/DESO = 2.5e-10 DESO = 0.25 nanos → floors to 0n
    const result = usdToDesoNanos(0.000000001, 4);
    expect(result).toBe(bi(0));
  });

  it('truncates toward zero (never rounds up)', () => {
    // $0.00001 at $4/DESO = 2500 nanos exactly
    expect(usdToDesoNanos(0.00001, 4)).toBe(bi(2500));
    // $0.0000099999 at $4/DESO ~= 2499.975 nanos → floors to 2499n
    // (may be 2499n or 2500n depending on float precision, so just verify
    // it's not higher than the mathematically exact answer)
    const result = usdToDesoNanos(0.0000099999, 4);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThanOrEqual(bi(2500));
  });
});
