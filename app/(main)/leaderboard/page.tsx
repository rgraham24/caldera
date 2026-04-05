import { createClient } from "@/lib/supabase/server";
import { LeaderboardClient } from "./leaderboard-client";
import type { LeaderboardEntry } from "@/types";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: rawEntries } = await supabase
    .from("leaderboard_snapshots")
    .select(
      "*, user:users(id, username, avatar_url, is_verified, reputation_score)"
    )
    .eq("period", "alltime")
    .order("rank", { ascending: true });

  return (
    <LeaderboardClient
      initialEntries={
        (rawEntries as unknown as LeaderboardEntry[]) ?? []
      }
    />
  );
}
