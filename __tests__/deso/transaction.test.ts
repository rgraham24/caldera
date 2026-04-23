/**
 * Tests for lib/deso/transaction.ts
 *
 * Only covers pure input-validation / error-shape guarantees.
 * Real signing and real network submits happen on the preview deploy
 * during the 3d.3 test trade — vitest should never hit api.deso.org.
 */
import { describe, it, expect } from 'vitest';
import { signAndSubmit } from '@/lib/deso/transaction';

describe('signAndSubmit — input-validation error shapes', () => {
  it('empty txHex → {success:false, stage:"sign"}', async () => {
    const result = await signAndSubmit('', 'some seed phrase');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.stage).toBe('sign');
      expect(result.error).toContain('txHex');
    }
  });

  it('empty seed → {success:false, stage:"sign"}', async () => {
    const result = await signAndSubmit('abc123', '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.stage).toBe('sign');
      expect(result.error).toContain('seed');
    }
  });

  it('null/undefined txHex → {success:false, stage:"sign"} (no throw)', async () => {
    // @ts-expect-error — intentionally passing bad input to verify runtime guard
    const result = await signAndSubmit(null, 'seed');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.stage).toBe('sign');
    }
  });

  it('never throws out — always returns a result object', async () => {
    // Pass genuinely garbage data; guarantee we get an object back, not an exception.
    await expect(
      signAndSubmit('not-a-real-hex', 'not-a-real-seed')
    ).resolves.toBeDefined();
  });
});
