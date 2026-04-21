/**
 * Tests for lib/fees/relevantToken.ts
 *
 * Covers the pure (no-DB) helpers only:
 *   - getTokenSlug
 *   - inferTokenType
 *   - tokenDisplayLabel
 *   - buildRelevantToken
 *
 * resolveRelevantToken (async/DB) is integration-tested elsewhere.
 */
import { describe, it, expect } from 'vitest';
import {
  getTokenSlug,
  inferTokenType,
  tokenDisplayLabel,
  buildRelevantToken,
  CATEGORY_TOKEN_MAP,
} from '@/lib/fees/relevantToken';

// ─── getTokenSlug ────────────────────────────────────────────────────

describe('getTokenSlug', () => {
  it('crypto market → returns creator_slug (e.g. "bitcoin")', () => {
    expect(getTokenSlug({ category: 'Crypto', crypto_ticker: 'BTC', creator_slug: 'bitcoin' })).toBe('bitcoin');
  });

  it('crypto market: uses creator_slug even if category_token_slug is also set', () => {
    expect(getTokenSlug({
      category: 'Crypto',
      crypto_ticker: 'SOL',
      creator_slug: 'solana',
      category_token_slug: 'solana',
    })).toBe('solana');
  });

  it('crypto_ticker without creator_slug → falls through to category_token_slug', () => {
    expect(getTokenSlug({
      category: 'Crypto',
      crypto_ticker: 'BTC',
      creator_slug: null,
      category_token_slug: 'caldera-tech',
    })).toBe('caldera-tech');
  });

  it('non-crypto with category_token_slug → uses it directly', () => {
    expect(getTokenSlug({
      category: 'Sports',
      category_token_slug: 'caldera-sports',
    })).toBe('caldera-sports');
  });

  it('non-crypto without category_token_slug → category map fallback', () => {
    expect(getTokenSlug({ category: 'Music' })).toBe('caldera-music');
    expect(getTokenSlug({ category: 'Politics' })).toBe('caldera-politics');
    expect(getTokenSlug({ category: 'Entertainment' })).toBe('caldera-entertainment');
    expect(getTokenSlug({ category: 'Companies' })).toBe('caldera-companies');
    expect(getTokenSlug({ category: 'Climate' })).toBe('caldera-climate');
    expect(getTokenSlug({ category: 'Tech' })).toBe('caldera-tech');
    expect(getTokenSlug({ category: 'Creators' })).toBe('caldera-creators');
  });

  it('unknown category with no token slug → returns null', () => {
    expect(getTokenSlug({ category: 'Unknown' })).toBeNull();
  });

  it('CATEGORY_TOKEN_MAP covers all 8 expected categories', () => {
    const expected = ['Sports', 'Music', 'Politics', 'Entertainment', 'Companies', 'Climate', 'Tech', 'Creators'];
    for (const cat of expected) {
      expect(CATEGORY_TOKEN_MAP[cat]).toBeDefined();
    }
  });
});

// ─── inferTokenType ──────────────────────────────────────────────────

describe('inferTokenType', () => {
  it('crypto market → type="crypto"', () => {
    expect(inferTokenType('bitcoin', { category: 'Crypto', crypto_ticker: 'BTC' })).toBe('crypto');
  });

  it('caldera- slug → type="category"', () => {
    expect(inferTokenType('caldera-sports', { category: 'Sports' })).toBe('category');
    expect(inferTokenType('caldera-music', { category: 'Music' })).toBe('category');
  });

  it('non-caldera non-crypto slug → type="creator"', () => {
    expect(inferTokenType('dharmesh', { category: 'Creators' })).toBe('creator');
  });
});

// ─── tokenDisplayLabel ───────────────────────────────────────────────

describe('tokenDisplayLabel', () => {
  it('strips caldera- prefix and uppercases', () => {
    expect(tokenDisplayLabel('caldera-sports')).toBe('$SPORTS');
    expect(tokenDisplayLabel('caldera-music')).toBe('$MUSIC');
  });

  it('crypto slugs just uppercase (no caldera- prefix to strip)', () => {
    expect(tokenDisplayLabel('bitcoin')).toBe('$BITCOIN');
    expect(tokenDisplayLabel('solana')).toBe('$SOLANA');
  });
});

// ─── buildRelevantToken ──────────────────────────────────────────────

describe('buildRelevantToken', () => {
  it('returns null when no slug can be determined', () => {
    expect(buildRelevantToken({ category: 'Unknown' }, null)).toBeNull();
  });

  it('crypto market builds correct token', () => {
    const t = buildRelevantToken(
      { category: 'Crypto', crypto_ticker: 'BTC', creator_slug: 'bitcoin' },
      'BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN',
    );
    expect(t).toEqual({
      type: 'crypto',
      slug: 'bitcoin',
      deso_public_key: 'BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN',
      display_label: '$BITCOIN',
    });
  });

  it('sports market builds correct category token', () => {
    const t = buildRelevantToken(
      { category: 'Sports', category_token_slug: 'caldera-sports' },
      'BC1YLi6ybMLmpvpgwwpxKq6653AnaPXb9p8TszF42mcyn8F1SGdXcEW',
    );
    expect(t).toEqual({
      type: 'category',
      slug: 'caldera-sports',
      deso_public_key: 'BC1YLi6ybMLmpvpgwwpxKq6653AnaPXb9p8TszF42mcyn8F1SGdXcEW',
      display_label: '$SPORTS',
    });
  });

  it('passes null deso_public_key through (coins without DeSo key yet)', () => {
    const t = buildRelevantToken(
      { category: 'Crypto', crypto_ticker: 'ETH', creator_slug: 'ethereum' },
      null,
    );
    expect(t?.deso_public_key).toBeNull();
    expect(t?.type).toBe('crypto');
    expect(t?.slug).toBe('ethereum');
  });
});
