import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Fetch category tokens separately — they have creator_coin_price=0 and would
  // fall off the end of the 1000-row default limit when sorted by price.
  const [{ data: categoryData }, { data: creatorData, error }] = await Promise.all([
    supabase
      .from("creators")
      .select("*")
      .eq("entity_type", "category"),

    supabase
      .from("creators")
      .select("*")
      .not("entity_type", "eq", "category")
      .not("token_status", "in", '("archived","speculation_pool","shadow")')
      .or("token_status.neq.pending_deso_creation,markets_count.gt.0")
      .order("creator_coin_price", { ascending: false }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Category tokens first, then individual creators
  const data = [...(categoryData ?? []), ...(creatorData ?? [])];

  return NextResponse.json({ data });
}
