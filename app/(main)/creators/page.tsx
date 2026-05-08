import { createClient } from "@/lib/supabase/server";
import {
  VERIFIED_FOR_MARKETS_OR,
  VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG,
} from "@/lib/creators/validity";
import { CreatorsClient } from "./creators-client";

export const revalidate = 0;

export const metadata = {
  title: "Creators — Caldera",
};

const PAGE_SIZE = 24;

/**
 * /creators — server-renders the first PAGE_SIZE rows in default sort
 * (market_cap desc) for instant first paint, then hands off to the
 * client wrapper for search/filter/sort/pagination via /api/creators/list.
 *
 * Mirrors the slim-payload shape the API uses so the initial render and
 * subsequent client fetches see identical data.
 */
export default async function CreatorsPage() {
  const supabase = await createClient();

  const SLIM_COLUMNS =
    "id, slug, name, deso_username, deso_public_key, image_url, " +
    "creator_coin_symbol, creator_coin_price, creator_coin_market_cap, " +
    "creator_coin_holders, weekly_volume_usd, markets_count, " +
    "token_status, tier, league, is_bitclout_original, " +
    "verification_status, claim_status, created_at";

  const [{ data, count }] = await Promise.all([
    supabase
      .from("creators")
      .select(SLIM_COLUMNS, { count: "exact" })
      .neq("entity_type", "category")
      .not("deso_public_key", "is", null)
      .not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)
      .or(VERIFIED_FOR_MARKETS_OR)
      .order("creator_coin_market_cap", { ascending: false, nullsFirst: false })
      .range(0, PAGE_SIZE - 1),
  ]);

  return (
    <CreatorsClient
      initialCreators={(data as unknown as import("@/types").Creator[]) ?? []}
      initialTotal={count ?? 0}
      pageSize={PAGE_SIZE}
    />
  );
}
