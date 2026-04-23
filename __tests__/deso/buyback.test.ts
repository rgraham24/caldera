/**
 * Tests for lib/deso/buyback.ts
 *
 * Covers the pure input-validation helper only. Real DeSo calls,
 * signing, submission, and fee_earnings writes are validated on
 * the preview deploy during 3d.3's real-trade verification.
 */
import { describe, it, expect } from 'vitest';
import { validateBuybackInputs, type BuybackParams } from '@/lib/deso/buyback';

// Dummy object just to make the params type shape happy — Supabase client
// isn't touched by the pure validator.
const dummySupabase = {} as BuybackParams['supabase'];

const goodParams: BuybackParams = {
  desoPublicKey: 'BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN',
  amountUsd: 0.005,
  feeEarningsRowId: '11111111-1111-1111-1111-111111111111',
  platformPublicKey: 'BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7',
  platformSeed: 'test seed phrase placeholder',
  supabase: dummySupabase,
};

describe('validateBuybackInputs', () => {
  it('accepts a fully valid params object', () => {
    const result = validateBuybackInputs(goodParams);
    expect(result.ok).toBe(true);
  });

  it('rejects empty desoPublicKey', () => {
    const result = validateBuybackInputs({ ...goodParams, desoPublicKey: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('desoPublicKey');
  });

  it('rejects malformed desoPublicKey (not BC1Y prefix)', () => {
    const result = validateBuybackInputs({ ...goodParams, desoPublicKey: 'XC1Ywhatever' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not a DeSo key');
  });

  it('rejects zero amountUsd', () => {
    const result = validateBuybackInputs({ ...goodParams, amountUsd: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('amountUsd');
  });

  it('rejects negative amountUsd', () => {
    const result = validateBuybackInputs({ ...goodParams, amountUsd: -0.005 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('amountUsd');
  });

  it('rejects NaN amountUsd', () => {
    const result = validateBuybackInputs({ ...goodParams, amountUsd: NaN });
    expect(result.ok).toBe(false);
  });

  it('rejects missing feeEarningsRowId', () => {
    const result = validateBuybackInputs({ ...goodParams, feeEarningsRowId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('feeEarningsRowId');
  });

  it('rejects malformed platformPublicKey', () => {
    const result = validateBuybackInputs({ ...goodParams, platformPublicKey: 'not-a-key' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('platformPublicKey');
  });

  it('rejects empty platformSeed', () => {
    const result = validateBuybackInputs({ ...goodParams, platformSeed: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('platformSeed');
  });

  it('accepts minimum-realistic amountUsd ($0.000001)', () => {
    const result = validateBuybackInputs({ ...goodParams, amountUsd: 0.000001 });
    expect(result.ok).toBe(true);
  });
});
