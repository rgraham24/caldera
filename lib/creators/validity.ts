import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single source of truth for "which creators can have markets attached."
 *
 * The locked v2 rule (2026-05-04): a creator is verified for markets if
 *   1. They have a real DeSo identity (deso_public_key set), AND
 *   2. At least ONE of:
 *      - deso_is_reserved = TRUE          (BitClout-original reserved profile)
 *      - verification_status = 'approved' (manually approved by Caldera admin)
 *      - claim_status = 'claimed'          (already claimed via DeSo JWT proof)
 *   3. token_status NOT IN ('archived', 'speculation_pool', 'pending_deso_creation')
 *
 * Squatter accounts — self-created DeSo profiles that posted but were
 * neither BitClout-reserved nor admin-approved — fail clause 2.
 *
 * Used by:
 *   - app/api/creators/search/route.ts (creator picker backend)
 *   - app/api/creators/list/route.ts (public /creators listing)
 *   - app/api/markets/admin-create/route.ts (admin form)
 *   - app/api/markets/create-fan/route.ts (user-created markets)
 *   - lib/admin/pipeline.ts (autonomous market generation)
 */

const EXCLUDED_TOKEN_STATUSES = new Set<string>([
  "archived",
  "speculation_pool",
  "pending_deso_creation",
]);

export type VerifiedCreatorFields = {
  deso_public_key: string | null;
  deso_is_reserved?: boolean | null;
  verification_status?: string | null;
  claim_status?: string | null;
  token_status?: string | null;
};

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
    creator.deso_is_reserved === true ||
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
      "id, slug, deso_public_key, deso_is_reserved, verification_status, claim_status, token_status"
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
      detail: `deso_public_key=${data.deso_public_key ? "set" : "null"} token_status=${data.token_status} reserved=${data.deso_is_reserved} verification=${data.verification_status} claim=${data.claim_status}`,
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
  "AND (deso_is_reserved = TRUE OR verification_status = 'approved' OR claim_status = 'claimed')";

/**
 * Supabase PostgREST `.or()` argument matching VERIFIED_FOR_MARKETS_SQL's
 * OR-clause. Use alongside `.not("deso_public_key", "is", null)` and
 * `.not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)`.
 */
export const VERIFIED_FOR_MARKETS_OR =
  "deso_is_reserved.eq.true,verification_status.eq.approved,claim_status.eq.claimed";

/**
 * PostgREST `not.in` argument for the excluded-statuses clause. Quoted for
 * the `.not("token_status", "in", ...)` builder call.
 */
export const VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG =
  '("archived","speculation_pool","pending_deso_creation")';

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
