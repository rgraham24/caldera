import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (!user) notFound();

  const { data: rawPositions } = await supabase
    .from("positions")
    .select("*, market:markets(*)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const { data: leaderboard } = await supabase
    .from("leaderboard_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .eq("period", "alltime")
    .single();

  return (
    <ProfileClient
      user={user}
      positions={(rawPositions as unknown as Parameters<typeof ProfileClient>[0]["positions"]) ?? []}
      leaderboard={leaderboard}
    />
  );
}
