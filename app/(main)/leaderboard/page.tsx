import { createClient } from "@/lib/supabase/server";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  // Get all users with their trade stats
  const { data: users } = await supabase.from("users").select("*");

  // Get positions for P/L
  const { data: positions } = await supabase
    .from("positions")
    .select("user_id, realized_pnl, unrealized_pnl_cached, status, market_id");

  // Get trades for volume
  const { data: trades } = await supabase
    .from("trades")
    .select("user_id, gross_amount, market_id, side, created_at");

  // Get markets for titles
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, slug");

  // Compute per-user stats
  const userStats = (users ?? []).map((u) => {
    const userPositions = (positions ?? []).filter((p) => p.user_id === u.id);
    const userTrades = (trades ?? []).filter((t) => t.user_id === u.id);

    const totalPnl = userPositions.reduce(
      (s, p) => s + (p.realized_pnl || 0) + (p.unrealized_pnl_cached || 0),
      0
    );
    const totalVolume = userTrades.reduce((s, t) => s + (t.gross_amount || 0), 0);
    const distinctMarkets = new Set(userTrades.map((t) => t.market_id)).size;
    const settled = userPositions.filter((p) => p.status === "settled");
    const wins = settled.filter((p) => (p.realized_pnl || 0) > 0).length;
    const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0;

    // Best call
    const best = settled.sort((a, b) => (b.realized_pnl || 0) - (a.realized_pnl || 0))[0];
    const bestMarket = best ? (markets ?? []).find((m) => m.id === best.market_id) : null;

    return {
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      totalPnl,
      totalVolume,
      distinctMarkets,
      winRate,
      bestCallTitle: bestMarket?.title?.slice(0, 30) || null,
      bestCallPnl: best?.realized_pnl || 0,
    };
  });

  // Sort by P/L descending, filter out zero-activity
  const ranked = userStats
    .filter((u) => u.totalVolume > 0)
    .sort((a, b) => b.totalPnl - a.totalPnl);

  // Top 5 biggest single wins
  const biggestWins = (positions ?? [])
    .filter((p) => p.status === "settled" && (p.realized_pnl || 0) > 0)
    .sort((a, b) => (b.realized_pnl || 0) - (a.realized_pnl || 0))
    .slice(0, 5)
    .map((p) => {
      const user = (users ?? []).find((u) => u.id === p.user_id);
      const market = (markets ?? []).find((m) => m.id === p.market_id);
      return {
        username: user?.username || "anon",
        marketTitle: market?.title?.slice(0, 40) || "",
        pnl: p.realized_pnl || 0,
      };
    });

  return (
    <LeaderboardClient traders={ranked} biggestWins={biggestWins} />
  );
}
