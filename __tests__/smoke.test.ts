import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('handles async', async () => {
    const result = await Promise.resolve('ok');
    expect(result).toBe('ok');
  });

  it('supports typescript types', () => {
    const x: number = 42;
    expect(typeof x).toBe('number');
  });
});
