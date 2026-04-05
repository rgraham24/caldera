import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [
    { data: positions },
    { data: leaderboard },
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("*, market:markets(*)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("leaderboard_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .eq("period", "alltime")
      .single(),
  ]);

  return NextResponse.json({
    data: {
      user,
      positions: positions ?? [],
      leaderboard: leaderboard ?? null,
    },
  });
}
