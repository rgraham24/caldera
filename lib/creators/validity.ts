import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single source of truth for "which creators can have markets attached."
 *
 * A creator is valid for market association if:
 *   1. They have a real DeSo identity (deso_public_key is set)
 *   2. Their token_status is in our active set
 *
 * Used by:
 *   - app/api/creators/search/route.ts (creator picker backend)
 *   - app/api/markets/admin-create/route.ts (admin form)
 *   - app/api/markets/create-fan/route.ts (user-created markets)
 *   - lib/admin/pipeline.ts (autonomous market generation)
 *
 * Locked decision (2026-05-04): No market may be inserted without a valid
 * creator. This prevents fees from routing to non-existent profiles or
 * squatter accounts. Theme creators, title-extraction artifacts, and
 * unverified placeholders are all rejected by this rule.
 */

export const VALID_TOKEN_STATUSES = [
  "active_unverified",
  "active_verified",
  "claimed",
] as const;

export type ValidTokenStatus = (typeof VALID_TOKEN_STATUSES)[number];

/**
 * Pure synchronous check — given a creator object already fetched from DB,
 * decide if it's valid for market association.
 */
export function isValidCreatorForMarkets(creator: {
  deso_public_key: string | null;
  token_status: string | null;
}): boolean {
  if (!creator.deso_public_key) return false;
  if (!creator.token_status) return false;
  return (VALID_TOKEN_STATUSES as readonly string[]).includes(creator.token_status);
}

/**
 * Async DB check — given a slug, look up the creator and check validity.
 * Returns { valid: false } for missing creators, invalid status, or no DeSo key.
 * Returns { valid: true, creator: {...} } when the creator passes.
 *
 * Use this from API routes before allowing market inserts.
 */
export async function creatorExistsAndValid(
  supabase: SupabaseClient,
  slug: string
): Promise<
  | { valid: true; creator: { id: string; slug: string; deso_public_key: string; token_status: string } }
  | { valid: false; reason: "not_found" | "no_deso_key" | "invalid_status"; status?: string }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("creators")
    .select("id, slug, deso_public_key, token_status")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, reason: "not_found" };
  }

  if (!data.deso_public_key) {
    return { valid: false, reason: "no_deso_key", status: data.token_status ?? undefined };
  }

  if (!(VALID_TOKEN_STATUSES as readonly string[]).includes(data.token_status ?? "")) {
    return { valid: false, reason: "invalid_status", status: data.token_status ?? undefined };
  }

  return {
    valid: true,
    creator: {
      id: data.id,
      slug: data.slug,
      deso_public_key: data.deso_public_key,
      token_status: data.token_status,
    },
  };
}

/**
 * SQL fragment for raw queries that need to filter to valid creators.
 * Pair with `from("creators").filter(...)` or use in a stored procedure.
 *
 * Example: `creators.deso_public_key IS NOT NULL AND creators.token_status IN ('active_unverified', 'active_verified', 'claimed')`
 */
export const VALID_CREATOR_SQL_FILTER =
  "deso_public_key IS NOT NULL AND token_status IN ('active_unverified', 'active_verified', 'claimed')";
