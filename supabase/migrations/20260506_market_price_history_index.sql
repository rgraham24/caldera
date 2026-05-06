-- Index to make snapshot-prices cron's "latest snapshot per market" lookup
-- fast, and to make future retention DELETEs (by recorded_at) fast.
--
-- (market_id, recorded_at DESC) supports:
--   1. SELECT ... WHERE market_id IN (...) ORDER BY market_id, recorded_at DESC
--      → index-ordered scan, no sort, returns one row per market in order.
--   2. DELETE ... WHERE recorded_at < NOW() - INTERVAL '30 days'
--      → range scan on the second column.
--   3. Per-market chart queries from /api/markets/[id]/price-history.

CREATE INDEX IF NOT EXISTS market_price_history_market_recorded_idx
  ON market_price_history (market_id, recorded_at DESC);
