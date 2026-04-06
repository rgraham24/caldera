import type { Database } from "@/lib/supabase/types";

// Row types from database
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Creator = Database["public"]["Tables"]["creators"]["Row"];
export type Market = Database["public"]["Tables"]["markets"]["Row"];
export type Position = Database["public"]["Tables"]["positions"]["Row"];
export type Trade = Database["public"]["Tables"]["trades"]["Row"];
export type MarketComment = Database["public"]["Tables"]["market_comments"]["Row"];
export type Watchlist = Database["public"]["Tables"]["watchlists"]["Row"];
export type LeaderboardSnapshot = Database["public"]["Tables"]["leaderboard_snapshots"]["Row"];
export type FeeEarning = Database["public"]["Tables"]["fee_earnings"]["Row"];
export type MarketResolution = Database["public"]["Tables"]["market_resolutions"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type PlatformConfig = Database["public"]["Tables"]["platform_config"]["Row"];

// Market status union type
export type MarketStatus = "open" | "closed" | "resolving" | "resolved" | "cancelled";

// Trade side
export type TradeSide = "yes" | "no";

// Category type
export type Category = "creators" | "music" | "sports" | "tech" | "politics" | "entertainment";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "creators", label: "🎬 Creators" },
  { value: "music", label: "🎵 Music" },
  { value: "sports", label: "⚽ Sports" },
  { value: "tech", label: "💻 Tech" },
  { value: "politics", label: "👑 Politics" },
  { value: "entertainment", label: "🎭 Entertainment" },
];

// Leaderboard period
export type LeaderboardPeriod = "alltime" | "monthly" | "weekly";

// Position with market data (for portfolio views)
export type PositionWithMarket = Position & {
  market: Market;
};

// Comment with user data
export type CommentWithUser = MarketComment & {
  user: Pick<User, "id" | "username" | "avatar_url" | "is_verified">;
};

// Leaderboard entry with user data
export type LeaderboardEntry = LeaderboardSnapshot & {
  user: Pick<User, "id" | "username" | "avatar_url" | "is_verified" | "reputation_score">;
};
