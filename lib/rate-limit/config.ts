/**
 * P2-3 — Rate limit budget configs.
 *
 * Named buckets referenced by checkRateLimit() callers.
 * Tune here once; all consumer routes inherit.
 *
 * See docs/P2-3-rate-limit-design.md for rationale.
 */

export type RateLimitConfigName = "trades" | "login" | "news" | "creator_youtube_lookup";

export type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMIT_CONFIGS: Record<RateLimitConfigName, RateLimitConfig> = {
  // Money routes — per-user (session pubkey). Typical trade cadence is
  // tens of seconds between user clicks; 10/minute is very permissive
  // for real users, aggressive enough to stop spam scripts.
  trades: { limit: 10, windowSeconds: 60 },

  // Login — per-IP (pre-auth). 5/min gives retry headroom on bad
  // wallet state without enabling credential-stuffing attempts.
  login: { limit: 5, windowSeconds: 60 },

  // News — per-IP. Replaces broken 1-req-per-60s Map limiter that
  // 429'd during normal page browsing. 30/min absorbs multi-market
  // homepage fetches comfortably.
  news: { limit: 30, windowSeconds: 60 },

  // Creator YouTube lookup — per-IP. Hit when the Create-market
  // wizard prefetches stats on creator pick. Most legitimate users
  // pick at most a few creators per minute; 30/min absorbs that
  // comfortably and blocks scraping the endpoint to harvest stats.
  creator_youtube_lookup: { limit: 30, windowSeconds: 60 },
} as const;
