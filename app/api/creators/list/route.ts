import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  VERIFIED_FOR_MARKETS_OR,
  VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG,
} from "@/lib/creators/validity";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .neq("entity_type", "category")
    .not("deso_public_key", "is", null)
    .not("token_status", "in", VERIFIED_FOR_MARKETS_EXCLUDED_STATUSES_PG)
    .or(VERIFIED_FOR_MARKETS_OR)
    .order("creator_coin_price", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
