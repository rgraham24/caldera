import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PortfolioClient } from "./portfolio-client";

export default async function PortfolioPage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const { data: rawPositions } = await supabase
    .from("positions")
    .select("*, market:markets(*)")
    .eq("user_id", authUser.id)
    .order("updated_at", { ascending: false });

  const { data: rawWatchlist } = await supabase
    .from("watchlists")
    .select("*, market:markets(*)")
    .eq("user_id", authUser.id)
    .eq("entity_type", "market");

  return (
    <PortfolioClient
      positions={(rawPositions as unknown as Parameters<typeof PortfolioClient>[0]["positions"]) ?? []}
      watchlist={(rawWatchlist as unknown as Parameters<typeof PortfolioClient>[0]["watchlist"]) ?? []}
    />
  );
}
