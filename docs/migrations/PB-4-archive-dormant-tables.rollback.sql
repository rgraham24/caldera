-- =============================================================
-- PB-4 ROLLBACK — Restore the four dormant tables from archive.
--
-- DO NOT run unless you are intentionally reverting PB-4.
--
-- Recreates each table's full schema (verbatim from the original
-- migrations 010_caldra_token.sql and 002_coin_holder_distributions.sql),
-- then restores rows from the *_archive_2026_05 snapshots.
--
-- Pre-conditions:
--   1. All four *_archive_2026_05 tables must exist with their
--      original pre-PB-4 row counts (likely zero).
-- =============================================================

-- ─── Step 1: Recreate caldra_token ───────────────────────────────

CREATE TABLE caldra_token (
  id uuid primary key default gen_random_uuid(),
  total_supply_nanos bigint default 0,
  reserve_balance_usd numeric default 0,
  price_usd numeric default 0.01,
  price_change_24h numeric default 0,
  holder_count integer default 0,
  total_volume_usd numeric default 0,
  total_distributed_usd numeric default 0,
  created_at timestamptz default now()
);

INSERT INTO caldra_token
  SELECT * FROM caldra_token_archive_2026_05;

-- If the archive was empty, restore the bootstrap row from
-- 010_caldra_token.sql so the table is in its expected initial state:
INSERT INTO caldra_token (price_usd)
  SELECT 0.01 WHERE NOT EXISTS (SELECT 1 FROM caldra_token);

-- ─── Step 2: Recreate caldra_holdings ───────────────────────────

CREATE TABLE caldra_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  balance_nanos bigint default 0,
  avg_purchase_price_usd numeric default 0,
  total_invested_usd numeric default 0,
  total_earned_usd numeric default 0,
  is_founding_holder boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE(user_id)
);

INSERT INTO caldra_holdings
  SELECT * FROM caldra_holdings_archive_2026_05;

-- ─── Step 3: Recreate caldra_trades ─────────────────────────────

CREATE TABLE caldra_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  operation text not null check (operation in ('buy', 'sell')),
  usd_amount numeric not null,
  token_amount_nanos bigint not null,
  price_usd_at_trade numeric not null,
  created_at timestamptz default now()
);

INSERT INTO caldra_trades
  SELECT * FROM caldra_trades_archive_2026_05;

-- ─── Step 4: Recreate coin_holder_distributions ─────────────────

CREATE TABLE coin_holder_distributions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id),
  trade_id uuid references trades(id),
  creator_id uuid references creators(id),
  total_pool_amount numeric not null,
  per_coin_amount numeric not null,
  snapshot_holder_count integer,
  created_at timestamptz default now()
);

INSERT INTO coin_holder_distributions
  SELECT * FROM coin_holder_distributions_archive_2026_05;

-- ─── Step 5: Verification ────────────────────────────────────────
--
-- All four tables exist again:
--   SELECT
--     to_regclass('public.caldra_token')              AS caldra_token,
--     to_regclass('public.caldra_holdings')           AS caldra_holdings,
--     to_regclass('public.caldra_trades')             AS caldra_trades,
--     to_regclass('public.coin_holder_distributions') AS coin_holder_distributions;
--   → expect: all four columns non-NULL
--
-- Row counts match archives:
--   SELECT
--     (SELECT COUNT(*) FROM caldra_token)              = (SELECT COUNT(*) FROM caldra_token_archive_2026_05) AS caldra_token_ok,
--     (SELECT COUNT(*) FROM caldra_holdings)           = (SELECT COUNT(*) FROM caldra_holdings_archive_2026_05) AS caldra_holdings_ok,
--     (SELECT COUNT(*) FROM caldra_trades)             = (SELECT COUNT(*) FROM caldra_trades_archive_2026_05) AS caldra_trades_ok,
--     (SELECT COUNT(*) FROM coin_holder_distributions) = (SELECT COUNT(*) FROM coin_holder_distributions_archive_2026_05) AS chd_ok;
--   → expect: all four columns = true
--
-- After verifying, the archives can be dropped manually if desired:
--   DROP TABLE caldra_token_archive_2026_05;
--   DROP TABLE caldra_holdings_archive_2026_05;
--   DROP TABLE caldra_trades_archive_2026_05;
--   DROP TABLE coin_holder_distributions_archive_2026_05;
