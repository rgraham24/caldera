import type { Database } from "@/lib/supabase/types";

// Row types from database
export type User = Database["public"]["Tables"]["users"]["Row"];
// Creator augmented with fields added after initial type generation
export type Creator = Database["public"]["Tables"]["creators"]["Row"] & {
  deso_is_reserved?: boolean | null;  // Tier 1 — DeSo reserved profile (gold badge)
  is_caldera_verified?: boolean | null; // Tier 2 — manually verified by Caldera (blue badge)
  // Verification & claim system (migration 20260414)
  twitter_handle?: string | null;
  twitter_handle_verified?: boolean | null;
  verification_status?: string | null; // 'unverified' | 'pending_review' | 'approved' | 'rejected'
  claim_code?: string | null;
  claim_status?: string | null; // 'unclaimed' | 'pending_claim' | 'claimed'
  claimed_at?: string | null;
  claimed_deso_key?: string | null;
  unclaimed_earnings_usd?: number | null;
};
export type Market = Database["public"]["Tables"]["markets"]["Row"] & {
  crypto_ticker?: string | null;
  crypto_target_price?: number | null;
  auto_resolve_at?: string | null;
  category_token_slug?: string | null;
};
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
export type Category = "creators" | "music" | "sports" | "tech" | "politics" | "entertainment" | "crypto" | "companies" | "climate";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "creators", label: "🎬 Creators" },
  { value: "crypto", label: "🪙 Crypto" },
  { value: "companies", label: "🏢 Companies" },
  { value: "sports", label: "⚽ Sports" },
  { value: "politics", label: "👑 Politics" },
  { value: "climate", label: "🌍 Climate" },
  { value: "music", label: "🎵 Music" },
  { value: "tech", label: "💻 Tech" },
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

// Categorical market outcome (market_outcomes table exists in Supabase but not in generated types)
export type MarketOutcome = {
  id: string;
  market_id: string;
  label: string;
  slug: string;
  creator_slug: string | null;
  probability: number;
  pool_size: number;
  image_url: string | null;
  display_order: number;
  is_winner: boolean | null;
  created_at: string;
};

// Market with outcomes joined (for categorical market queries)
export type MarketWithOutcomes = Market & {
  market_outcomes?: MarketOutcome[];
};

// Claim codes (not in generated DB types)
export type ClaimCode = {
  id: string;
  code: string;
  slug: string;
  status: string;
  claimed_at: string | null;
  claimed_by_deso_key: string | null;
  created_at: string;
};

export type ClaimCodeInsert = Omit<ClaimCode, "id" | "created_at">;
