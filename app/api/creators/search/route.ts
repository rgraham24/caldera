import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VALID_TOKEN_STATUSES } from "@/lib/creators/validity";

export const dynamic = "force-dynamic";

/**
 * GET /api/creators/search?q=drake
 *
 * Returns up to 20 valid creators matching the query. Used by the
 * creator-picker UI in market creation forms.
 *
 * A creator is "valid" if it has a real DeSo public key AND its
 * token_status is in our active set. See lib/creators/validity.ts.
 *
 * Match rules: q matches slug OR name OR deso_username (case-insensitive).
 * Empty q returns the top 20 valid creators by markets_count.
 *
 * Response shape:
 *   { creators: Array<{
 *       id, slug, name, deso_username, deso_public_key,
 *       token_status, markets_count, claim_status
 *     }> }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const supabase = await createClient();

  let query = supabase
    .from("creators")
    .select(
      "id, slug, name, deso_username, deso_public_key, token_status, markets_count, claim_status"
    )
    .not("deso_public_key", "is", null)
    .in("token_status", VALID_TOKEN_STATUSES as unknown as string[])
    .order("markets_count", { ascending: false, nullsFirst: false })
    .limit(20);

  if (q.length > 0) {
    // ILIKE on three columns. Postgres OR groups go in .or() with comma syntax.
    const escaped = q.replace(/[%_]/g, "\\$&"); // escape SQL wildcards
    const pattern = `%${escaped}%`;
    query = query.or(
      `slug.ilike.${pattern},name.ilike.${pattern},deso_username.ilike.${pattern}`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[creators/search]", error);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  return NextResponse.json({ creators: data ?? [] });
}
