import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .not("token_status", "in", '("archived","speculation_pool")')
    .or('token_status.neq.shadow,markets_count.gt.0')
    .order("creator_coin_price", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
