import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  VERIFIED_FOR_MARKETS_OR,
  VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG,
} from "@/lib/creators/validity";

/**
 * GET /api/creators/list
 *
 * Server-paginated creator discovery feed for the /creators page.
 *
 * Query params:
 *   q          ILIKE substring on slug / name / deso_username (optional)
 *   category   single canonical CATEGORIES.value; expanded via CAT_GROUPS
 *              for the two historical aliases (creators ↔ streamers,
 *              sports ↔ athletes). Direct match otherwise. Empty/all
 *              for no filter.
 *   sort       one of: market_cap | volume | holders | price | newest
 *              (default: market_cap)
 *   limit      page size, default 24, capped at MAX_LIMIT (60)
 *   offset     starting row, default 0
 *
 * Response:
 *   { data: Creator[], total: number, hasMore: boolean }
 *
 * `data` payload is slim — only the columns the discovery card renders.
 * Verified-for-markets filter applied (matches the rest of the platform).
 */

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

const SLIM_COLUMNS =
  "id, slug, name, deso_username, deso_public_key, image_url, " +
  "creator_coin_symbol, creator_coin_price, creator_coin_market_cap, " +
  "creator_coin_holders, weekly_volume_usd, markets_count, " +
  "token_status, tier, league, is_bitclout_original, " +
  "verification_status, claim_status, created_at";

// CAT_GROUPS mirrors the alias rollup on /markets so creator-discovery
// stays consistent with market-discovery. Only the two historical
// aliases get rollup treatment; everything else is a direct match.
const CAT_GROUPS: Record<string, string[]> = {
  creators: ["creators", "streamers"],
  sports: ["sports", "athletes"],
};

const SORT_KEYS = ["market_cap", "volume", "holders", "price", "newest"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function sortColumn(sort: SortKey): { column: string; ascending: boolean } {
  switch (sort) {
    case "volume":
      return { column: "weekly_volume_usd", ascending: false };
    case "holders":
      return { column: "creator_coin_holders", ascending: false };
    case "price":
      return { column: "creator_coin_price", ascending: false };
    case "newest":
      return { column: "created_at", ascending: false };
    case "market_cap":
    default:
      return { column: "creator_coin_market_cap", ascending: false };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim().toLowerCase();
  const sortRaw = (searchParams.get("sort") ?? "market_cap") as SortKey;
  const sort: SortKey = SORT_KEYS.includes(sortRaw) ? sortRaw : "market_cap";
  const limitRaw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? DEFAULT_LIMIT : limitRaw, 1), MAX_LIMIT);
  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(isNaN(offsetRaw) ? 0 : offsetRaw, 0);

  const supabase = await createClient();

  // Compose the verified-for-markets filter once and reuse for both the
  // data query and the count query so they always see the same rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildFiltered = (q1: any) =>
    q1
      .neq("entity_type", "category")
      .not("deso_public_key", "is", null)
      .not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)
      .or(VERIFIED_FOR_MARKETS_OR);

  // Category: alias-expand if the value is in CAT_GROUPS, otherwise
  // direct match. Empty / "all" / unknown skips the filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyCategory = (q1: any) => {
    if (!category || category === "all") return q1;
    const aliases = CAT_GROUPS[category] ?? [category];
    return aliases.length === 1
      ? q1.eq("category", aliases[0])
      : q1.in("category", aliases);
  };

  // Search: ILIKE on three columns via Supabase .or() with comma syntax.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applySearch = (q1: any) => {
    if (!q) return q1;
    const escaped = q.replace(/[%_]/g, "\\$&"); // escape SQL wildcards
    const pattern = `%${escaped}%`;
    return q1.or(
      `slug.ilike.${pattern},name.ilike.${pattern},deso_username.ilike.${pattern}`
    );
  };

  // Data query — slim payload + sort + paginated range.
  const { column, ascending } = sortColumn(sort);
  let dataQuery = supabase.from("creators").select(SLIM_COLUMNS);
  dataQuery = buildFiltered(dataQuery);
  dataQuery = applyCategory(dataQuery);
  dataQuery = applySearch(dataQuery);
  dataQuery = dataQuery
    .order(column, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // Total query — same filters, no select, head-only.
  let countQuery = supabase
    .from("creators")
    .select("id", { count: "exact", head: true });
  countQuery = buildFiltered(countQuery);
  countQuery = applyCategory(countQuery);
  countQuery = applySearch(countQuery);

  const [{ data, error: dataErr }, { count, error: countErr }] = await Promise.all([
    dataQuery,
    countQuery,
  ]);

  if (dataErr) {
    return NextResponse.json({ error: dataErr.message }, { status: 500 });
  }
  if (countErr) {
    // Soft-fail count — return the data we have, hasMore conservatively true.
    return NextResponse.json({
      data: data ?? [],
      total: (data ?? []).length,
      hasMore: (data ?? []).length === limit,
    });
  }

  const rows = data ?? [];
  const total = count ?? rows.length;
  const hasMore = offset + rows.length < total;

  return NextResponse.json({ data: rows, total, hasMore });
}
