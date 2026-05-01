-- =============================================================
-- PB-4 — Archive and drop dormant schema artifacts.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Drops four dormant tables that no live code references:
--
--   caldra_token, caldra_holdings, caldra_trades
--     Per DECISIONS.md 2026-04-16: "We are NOT launching a $CALDRA
--     token. The caldra_token, caldra_holdings, and caldra_trades
--     tables in Supabase are dormant schema artifacts from an
--     earlier exploration. No live code references them. They
--     will be dropped in a future migration but kept for now."
--     PB-4 is that future migration.
--
--   coin_holder_distributions
--     Per AUDIT_MONEY_FLOWS.md SELL-8: dead table from an earlier
--     model that pre-dates the v1 holder_rewards ledger. No live
--     code path writes to it.
--
-- Each table gets its own *_archive_2026_05 snapshot before drop.
-- The 002_coin_holder_distributions.sql migration also added
-- columns to other tables (trades.coin_holder_pool_amount,
-- creators.total_coins_in_circulation, creators.total_fees_distributed,
-- users.coin_earnings_balance). Those columns are NOT dropped here
-- — they are out of scope for this migration; see Phase D.
--
-- The community_pool table (also created by 010_caldra_token.sql)
-- is NOT dropped here. It is out of scope for PB-4 — only the
-- caldra_* tables and coin_holder_distributions are listed in
-- the audit.
--
-- ROLLBACK: see PB-4-archive-dormant-tables.rollback.sql
-- =============================================================

-- ─── Step 0: Pre-flight diagnostics (read-only) ──────────────────
-- These tables are expected to contain zero rows. Verify:
-- SELECT 'caldra_token' AS t, COUNT(*) FROM caldra_token
-- UNION ALL SELECT 'caldra_holdings', COUNT(*) FROM caldra_holdings
-- UNION ALL SELECT 'caldra_trades', COUNT(*) FROM caldra_trades
-- UNION ALL SELECT 'coin_holder_distributions', COUNT(*) FROM coin_holder_distributions;

-- ─── Step 1: Archive each dormant table ──────────────────────────

CREATE TABLE caldra_token_archive_2026_05 AS
  SELECT * FROM caldra_token;

CREATE TABLE caldra_holdings_archive_2026_05 AS
  SELECT * FROM caldra_holdings;

CREATE TABLE caldra_trades_archive_2026_05 AS
  SELECT * FROM caldra_trades;

CREATE TABLE coin_holder_distributions_archive_2026_05 AS
  SELECT * FROM coin_holder_distributions;

-- Verification (assert before the destructive steps below):
-- SELECT
--   (SELECT COUNT(*) FROM caldra_token)              = (SELECT COUNT(*) FROM caldra_token_archive_2026_05) AS caldra_token_ok,
--   (SELECT COUNT(*) FROM caldra_holdings)           = (SELECT COUNT(*) FROM caldra_holdings_archive_2026_05) AS caldra_holdings_ok,
--   (SELECT COUNT(*) FROM caldra_trades)             = (SELECT COUNT(*) FROM caldra_trades_archive_2026_05) AS caldra_trades_ok,
--   (SELECT COUNT(*) FROM coin_holder_distributions) = (SELECT COUNT(*) FROM coin_holder_distributions_archive_2026_05) AS chd_ok;
-- → expect: all four columns = true

-- ─── Step 2: Drop the live tables ───────────────────────────────
-- CASCADE handles any FK references. Per audit, none exist.

DROP TABLE caldra_token CASCADE;
DROP TABLE caldra_holdings CASCADE;
DROP TABLE caldra_trades CASCADE;
DROP TABLE coin_holder_distributions CASCADE;

-- ─── Step 3: Verification ────────────────────────────────────────
--
-- 1. Live tables are gone:
--    SELECT
--      to_regclass('public.caldra_token')              AS caldra_token,
--      to_regclass('public.caldra_holdings')           AS caldra_holdings,
--      to_regclass('public.caldra_trades')             AS caldra_trades,
--      to_regclass('public.coin_holder_distributions') AS coin_holder_distributions;
--    → expect: all four columns = NULL
--
-- 2. Archives are intact:
--    SELECT 'caldra_token' AS t, COUNT(*) FROM caldra_token_archive_2026_05
--    UNION ALL SELECT 'caldra_holdings', COUNT(*) FROM caldra_holdings_archive_2026_05
--    UNION ALL SELECT 'caldra_trades', COUNT(*) FROM caldra_trades_archive_2026_05
--    UNION ALL SELECT 'coin_holder_distributions', COUNT(*) FROM coin_holder_distributions_archive_2026_05;
--    → expect: original pre-migration row counts (likely all zero)
