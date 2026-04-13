import { createClient } from "@/lib/supabase/server";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaderboardPage() {
  try {
    const supabase = await createClient();

    // Fetch positions first — they drive the leaderboard.
    // Cap at 2 000 rows so the function never times out.
    const { data: positions, error: posErr } = await supabase
      .from("positions")
      .select("user_id, realized_pnl, unrealized_pnl_cached, status, market_id")
      .limit(2000);

    if (posErr) throw posErr;

    // Derive the set of active trader IDs so we only fetch those users.
    const activeUserIds = [...new Set((positions ?? []).map((p) => p.user_id))];

    if (activeUserIds.length === 0) {
      return <LeaderboardClient traders={[]} biggestWins={[]} />;
    }

    // Fetch only the users we need (username + avatar only).
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url, deso_public_key")
      .in("id", activeUserIds);

    // Fetch trades scoped to active traders, capped to avoid timeout.
    const { data: trades } = await supabase
      .from("trades")
      .select("user_id, gross_amount, market_id")
      .in("user_id", activeUserIds)
      .limit(5000);

    // Fetch only the markets referenced by settled positions for "best call".
    const settledPositions = (positions ?? []).filter(
      (p) => p.status === "settled" && (p.realized_pnl ?? 0) > 0
    );
    const referencedMarketIds = [
      ...new Set(settledPositions.map((p) => p.market_id).filter(Boolean)),
    ].slice(0, 200);

    const { data: markets } =
      referencedMarketIds.length > 0
        ? await supabase
            .from("markets")
            .select("id, title")
            .in("id", referencedMarketIds)
        : { data: [] };

    // Compute per-user stats in memory.
    const userStats = (users ?? []).map((u) => {
      const userPositions = (positions ?? []).filter((p) => p.user_id === u.id);
      const userTrades = (trades ?? []).filter((t) => t.user_id === u.id);

      const totalPnl = userPositions.reduce(
        (s, p) => s + (p.realized_pnl ?? 0) + (p.unrealized_pnl_cached ?? 0),
        0
      );
      const totalVolume = userTrades.reduce((s, t) => s + (t.gross_amount ?? 0), 0);
      const distinctMarkets = new Set(userTrades.map((t) => t.market_id)).size;

      const settled = userPositions.filter((p) => p.status === "settled");
      const wins = settled.filter((p) => (p.realized_pnl ?? 0) > 0).length;
      const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0;

      const best = [...settled].sort(
        (a, b) => (b.realized_pnl ?? 0) - (a.realized_pnl ?? 0)
      )[0];
      const bestMarket = best
        ? (markets ?? []).find((m) => m.id === best.market_id)
        : null;

      return {
        id: u.id,
        username: u.username ?? u.deso_public_key?.slice(0, 10) ?? "anon",
        avatar_url: u.avatar_url,
        totalPnl,
        totalVolume,
        distinctMarkets,
        winRate,
        bestCallTitle: bestMarket?.title?.slice(0, 30) ?? null,
        bestCallPnl: best?.realized_pnl ?? 0,
      };
    });

    const ranked = userStats
      .filter((u) => u.totalVolume > 0)
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, 50);

    const biggestWins = settledPositions
      .sort((a, b) => (b.realized_pnl ?? 0) - (a.realized_pnl ?? 0))
      .slice(0, 5)
      .map((p) => {
        const user = (users ?? []).find((u) => u.id === p.user_id);
        const market = (markets ?? []).find((m) => m.id === p.market_id);
        return {
          username: user?.username ?? "anon",
          marketTitle: market?.title?.slice(0, 40) ?? "",
          pnl: p.realized_pnl ?? 0,
        };
      });

    return <LeaderboardClient traders={ranked} biggestWins={biggestWins} />;
  } catch {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <h1 className="mb-4 font-display text-3xl font-bold text-text-primary">
          Leaderboard
        </h1>
        <p className="text-text-muted">
          Could not load leaderboard right now. Please try again.
        </p>
      </div>
    );
  }
}
