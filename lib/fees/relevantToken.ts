/**
 * lib/fees/relevantToken.ts
 *
 * Resolves the "relevant token" for a market — the DeSo creator coin that
 * receives the 0.5% holder-rewards + 0.5% auto-buy slices on every buy trade.
 *
 * Resolution rules (in priority order):
 *   1. Crypto market (crypto_ticker set) → type='crypto', slug=creator_slug
 *   2. market.category_token_slug stored → use it (type inferred from slug)
 *   3. Category fallback → caldera-{category} slug → type='category'
 *   4. No match → null
 *
 * deso_public_key comes from a DB lookup on creators.slug.
 * Some crypto coins (dogecoin, ethereum) have no DeSo key yet — the token is
 * still returned (for display/ledger), but auto-buy will be skipped at
 * execution time when deso_public_key is null.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RelevantToken, RelevantTokenType } from './calculator';

// ─── Category map ────────────────────────────────────────────────────

/** market.category → category token slug */
export const CATEGORY_TOKEN_MAP: Record<string, string> = {
  Sports:        'caldera-sports',
  Music:         'caldera-music',
  Politics:      'caldera-politics',
  Entertainment: 'caldera-entertainment',
  Companies:     'caldera-companies',
  Climate:       'caldera-climate',
  Tech:          'caldera-tech',
  Creators:      'caldera-creators',
};

// ─── Types ───────────────────────────────────────────────────────────

export type MarketTokenInput = {
  category: string;
  crypto_ticker?: string | null;
  creator_slug?: string | null;
  category_token_slug?: string | null;
};

// ─── Pure helpers (no DB) ────────────────────────────────────────────

/**
 * Determine the token slug from market fields.
 * Mirrors the existing getCategoryTokenSlug() logic in TradeTicket / market-detail-client.
 */
export function getTokenSlug(market: MarketTokenInput): string | null {
  // Crypto markets: token = the coin's creator-coin slug
  if (market.crypto_ticker && market.creator_slug) {
    return market.creator_slug;
  }
  // Explicitly stored slug (set at market-creation time)
  if (market.category_token_slug) {
    return market.category_token_slug;
  }
  // Category fallback
  return CATEGORY_TOKEN_MAP[market.category] ?? null;
}

/** Infer token type from slug + market fields. */
export function inferTokenType(slug: string, market: MarketTokenInput): RelevantTokenType {
  if (market.crypto_ticker) return 'crypto';
  if (slug.startsWith('caldera-')) return 'category';
  return 'creator';
}

/** Build a display label from a slug, e.g. 'caldera-sports' → '$SPORTS'. */
export function tokenDisplayLabel(slug: string): string {
  return '$' + slug.replace('caldera-', '').toUpperCase();
}

/**
 * Synchronous build — use when you already have the deso_public_key
 * (e.g. fetched via a join) and want to avoid a second DB round-trip.
 */
export function buildRelevantToken(
  market: MarketTokenInput,
  desoPublicKey: string | null,
): RelevantToken | null {
  const slug = getTokenSlug(market);
  if (!slug) return null;
  return {
    type: inferTokenType(slug, market),
    slug,
    deso_public_key: desoPublicKey,
    display_label: tokenDisplayLabel(slug),
  };
}

// ─── Async resolver (DB lookup) ──────────────────────────────────────

/**
 * Resolve the relevant token for a market, including a DB lookup for
 * deso_public_key.
 *
 * Returns null only if no slug can be determined (should be rare —
 * fallback covers all known categories).
 */
export async function resolveRelevantToken(
  market: MarketTokenInput,
  supabase: SupabaseClient,
): Promise<RelevantToken | null> {
  const slug = getTokenSlug(market);
  if (!slug) return null;

  const { data: creator } = await supabase
    .from('creators')
    .select('deso_public_key')
    .eq('slug', slug)
    .maybeSingle();

  return {
    type: inferTokenType(slug, market),
    slug,
    deso_public_key: creator?.deso_public_key ?? null,
    display_label: tokenDisplayLabel(slug),
  };
}
