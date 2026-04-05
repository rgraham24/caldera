import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const period = searchParams.get("period") || "alltime";

  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("*, user:users(id, username, avatar_url, is_verified, reputation_score)")
    .eq("period", period)
    .order("rank", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
