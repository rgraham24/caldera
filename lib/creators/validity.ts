import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single source of truth for "which creators can have markets attached."
 *
 * The locked v2 rule: a creator is verified for markets if
 *   1. They have a real DeSo identity (deso_public_key set), AND
 *   2. At least ONE of:
 *      - is_bitclout_original = TRUE       (member of the BitClout-original
 *        reserved list per deso-protocol/core/lib/reserved_usernames.go,
 *        mirrored locally in the bitclout_reserved_usernames table)
 *      - verification_status = 'approved'  (manually approved by Caldera admin)
 *      - claim_status = 'claimed'          (already claimed via DeSo JWT proof)
 *   3. token_status NOT IN ('archived', 'speculation_pool', 'pending_deso_creation')
 *
 * Phase 4c flipped from deso_is_reserved to is_bitclout_original because
 * deso_is_reserved was set inconsistently across import paths (squatters
 * could end up tagged true). is_bitclout_original is sourced once from
 * DeSo's canonical list and is effectively immutable.
 *
 * Used by:
 *   - app/api/creators/search/route.ts (creator picker backend)
 *   - app/api/creators/list/route.ts (public /creators listing)
 *   - app/api/markets/admin-create/route.ts (admin form)
 *   - lib/admin/pipeline.ts (autonomous market generation)
 */

const EXCLUDED_TOKEN_STATUSES = new Set<string>([
  "archived",
  "speculation_pool",
  "pending_deso_creation",
]);

export type VerifiedCreatorFields = {
  deso_public_key: string | null;
  is_bitclout_original?: boolean | null;
  /** @deprecated kept for back-compat with callers that still SELECT this column; not consulted by the rule. */
  deso_is_reserved?: boolean | null;
  verification_status?: string | null;
  claim_status?: string | null;
  token_status?: string | null;
};

/**
 * Display-side verification check — used by the VerificationBadge UI to
 * decide whether to render the blue check next to a creator's name.
 *
 * Looser than isVerifiedForMarkets — does NOT require deso_public_key or
 * gate on token_status. A creator on the BitClout-original list is still
 * a verified person even before their DeSo identity gets imported into
 * our row.
 *
 * Intentionally excludes claim_status: claiming is wallet ownership,
 * not identity verification.
 */
export function isCreatorVerified(c: {
  is_bitclout_original?: boolean | null;
  verification_status?: string | null;
}): boolean {
  return Boolean(c.is_bitclout_original) || c.verification_status === "approved";
}

/**
 * Pure synchronous check — given a creator object already fetched from DB,
 * decide if it's verified for market association.
 */
export function isVerifiedForMarkets(creator: VerifiedCreatorFields): boolean {
  if (!creator.deso_public_key) return false;
  if (creator.token_status && EXCLUDED_TOKEN_STATUSES.has(creator.token_status)) {
    return false;
  }
  return Boolean(
    creator.is_bitclout_original === true ||
      creator.verification_status === "approved" ||
      creator.claim_status === "claimed"
  );
}

/**
 * Async DB check — given a slug, look up the creator and check verification.
 * Returns { valid: false } for missing creators or unverified state.
 * Returns { valid: true, creator: {...} } when the creator passes.
 *
 * Use this from API routes before allowing market inserts.
 */
export async function creatorIsVerifiedForMarkets(
  slug: string,
  supabase: SupabaseClient
): Promise<
  | {
      valid: true;
      creator: {
        id: string;
        slug: string;
        deso_public_key: string;
        token_status: string | null;
      };
    }
  | {
      valid: false;
      reason: "not_found" | "not_verified";
      detail?: string;
    }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("creators")
    .select(
      "id, slug, deso_public_key, is_bitclout_original, verification_status, claim_status, token_status"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, reason: "not_found" };
  }

  if (!isVerifiedForMarkets(data)) {
    return {
      valid: false,
      reason: "not_verified",
      detail: `deso_public_key=${data.deso_public_key ? "set" : "null"} token_status=${data.token_status} bitclout_original=${data.is_bitclout_original} verification=${data.verification_status} claim=${data.claim_status}`,
    };
  }

  return {
    valid: true,
    creator: {
      id: data.id,
      slug: data.slug,
      deso_public_key: data.deso_public_key as string,
      token_status: data.token_status,
    },
  };
}

/**
 * SQL fragment for raw queries / RPC bodies that need the verified-for-markets
 * filter. Compose into a WHERE clause:
 *
 *   `select * from creators where ${VERIFIED_FOR_MARKETS_SQL}`
 *
 * For Supabase JS builder queries, prefer chaining `.not()` + `.or()` directly
 * (see app/api/creators/search/route.ts for an example) — the builder's filters
 * can't safely interpolate this string.
 */
export const VERIFIED_FOR_MARKETS_SQL =
  "deso_public_key IS NOT NULL " +
  "AND token_status NOT IN ('archived', 'speculation_pool', 'pending_deso_creation') " +
  "AND (is_bitclout_original = TRUE OR verification_status = 'approved' OR claim_status = 'claimed')";

/**
 * Supabase PostgREST `.or()` argument matching VERIFIED_FOR_MARKETS_SQL's
 * OR-clause. Use alongside `.not("deso_public_key", "is", null)` and
 * `.not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)`.
 */
export const VERIFIED_FOR_MARKETS_OR =
  "is_bitclout_original.eq.true,verification_status.eq.approved,claim_status.eq.claimed";

/**
 * PostgREST `not.in` argument for the excluded-statuses clause. Quoted for
 * the `.not("token_status", "in", ...)` builder call.
 */
export const VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG =
  '("archived","speculation_pool","pending_deso_creation")';

/**
 * Fetches the set of creator slugs currently verified for markets. Use this
 * to post-filter market lists that were fetched without a creator join, e.g.
 * the homepage and /markets listing pages. Cheap — single indexed scan.
 *
 * Phase 3 defense-in-depth — becomes redundant after Phase 4 cleans data.
 */
export async function fetchVerifiedCreatorSlugs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<Set<string>> {
  // Supabase has a server-side row cap (max-rows config, typically 1000)
  // that overrides client-side .limit() values. The previous .limit(20000)
  // attempt was silently capped at 1000, and adding .order("slug") only
  // made the truncation deterministic alphabetical — dropping every
  // verified creator past position 1000. Production saw 0 hero cards
  // because all 5 (chiefs, diddy, kingjames, loganpaul, mrbeastyt) sort
  // after "arikaleph" which is the 1000th slug.
  //
  // This loop pages via .range() until a short page or empty page is
  // returned, then unions all slugs into a single Set. Safety cap of 30
  // pages = 30k rows; warns if hit so we can bump or migrate to an inline
  // JOIN before silent truncation recurs.
  const PAGE_SIZE = 1000;
  const all = new Set<string>();
  let from = 0;
  let safetyCounter = 0;

  while (safetyCounter++ < 30) {
    const { data, error } = await supabase
      .from("creators")
      .select("slug")
      .not("deso_public_key", "is", null)
      .not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)
      .or(VERIFIED_FOR_MARKETS_OR)
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[fetchVerifiedCreatorSlugs] page fetch failed at offset", from, error);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data as Array<{ slug: string }>) all.add(row.slug);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (safetyCounter >= 30) {
    console.warn(
      "[fetchVerifiedCreatorSlugs] hit 30-page safety cap (30000 rows). " +
        "Bump cap or move to inline JOIN before silent truncation recurs."
    );
  }

  return all;
}

/**
 * Filter a market list to only those attached to verified creators. Markets
 * without a creator_slug, or whose creator_slug is unknown to the verified
 * set, are dropped.
 *
 * Phase 3 defense-in-depth — becomes redundant after Phase 4 cleans data.
 */
export function filterVerifiedMarkets<T extends { creator_slug?: string | null }>(
  markets: T[],
  verifiedSlugs: Set<string>
): T[] {
  return markets.filter((m) => !!m.creator_slug && verifiedSlugs.has(m.creator_slug));
}

/**
 * Dedupe a list of creator rows by deso_public_key, picking the freshest
 * row per group (highest coin_data_updated_at, falling back to created_at).
 * Rows without a deso_public_key are passed through untouched.
 *
 * Phase 3 defense-in-depth — Phase 5 will add a unique constraint at the
 * DB level, after which this helper can be retired.
 */
export function dedupeCreatorsByPubkey<
  T extends {
    deso_public_key?: string | null;
    coin_data_updated_at?: string | null;
    created_at?: string | null;
  },
>(creators: T[]): T[] {
  const byKey = new Map<string, T>();
  const passthrough: T[] = [];
  const ts = (x: T) =>
    new Date(x.coin_data_updated_at ?? x.created_at ?? 0).getTime();
  for (const c of creators) {
    const key = c.deso_public_key;
    if (!key) {
      passthrough.push(c);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || ts(c) > ts(existing)) byKey.set(key, c);
  }
  return [...byKey.values(), ...passthrough];
}

/**
 * @deprecated Use {@link isVerifiedForMarkets} / {@link creatorIsVerifiedForMarkets}
 * instead.
 *
 * Kept for backward compatibility during the verification-enforcement
 * migration. Admits `active_unverified` (squatters), which the new rule
 * rejects unless reserved-or-approved-or-claimed.
 */
export const VALID_TOKEN_STATUSES = [
  "active_unverified",
  "active_verified",
  "claimed",
] as const;

export type ValidTokenStatus = (typeof VALID_TOKEN_STATUSES)[number];
