import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  VERIFIED_FOR_MARKETS_OR,
  VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG,
} from "@/lib/creators/validity";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ creators: [], markets: [] });
  }

  const supabase = await createClient();

  const [creatorsRes, marketsRes] = await Promise.all([
    // Three-tier gate on creators surfaced to search:
    //  1. .not deso_public_key is null   — no orphan title-extraction stubs
    //  2. .not token_status in (archived…) — no retired rows
    //  3. .or VERIFIED_FOR_MARKETS_OR     — must be bitclout-original OR
    //     admin-approved OR claimed. Same canonical rule the badge uses.
    // Caught 339 dead/unverified rows that previously leaked into results
    // (e.g. "jake" — no pubkey, archived, ranking above the canonical
    // jakepaul row).
    supabase
      .from("creators")
      .select("id, slug, name, image_url, creator_coin_symbol, deso_public_key, is_bitclout_original, verification_status, creator_coin_market_cap")
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
      .not("entity_type", "eq", "category")
      .not("deso_public_key", "is", null)
      .not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)
      .or(VERIFIED_FOR_MARKETS_OR)
      .limit(8),
    supabase
      .from("markets")
      .select("id, slug, title, category, yes_price")
      .ilike("title", `%${q}%`)
      .eq("status", "open")
      .order("trending_score", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    creators: creatorsRes.data ?? [],
    markets: marketsRes.data ?? [],
  });
}
