-- =============================================================
-- PB-6 — Backfill NULL created_at on trades + fee_earnings rows.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Background (B.4 smoke test, 2026-05-01):
-- The original PB-1 atomic_record_trade_v2 RPC used jsonb_populate_record
-- to insert trades and fee_earnings rows. jsonb_populate_record produces
-- NULL for any column missing from the JSONB blob, BYPASSING the
-- column's DEFAULT clause. The route did not include created_at in
-- either JSONB, so every row inserted by the v2 RPC has created_at = NULL.
--
-- The updated PB-1 file fixes the RPC. PB-6 is a one-time data fix
-- for rows already inserted by the broken version.
--
-- Strategy:
--   1. Capture the affected row IDs in a small audit-log table so
--      the rollback can precisely re-NULL the same set of rows.
--   2. UPDATE trades.created_at = NOW().
--   3. UPDATE fee_earnings.created_at = COALESCE(paid_at, NOW()).
--      paid_at is the best-available real timestamp on rows where
--      executeTokenBuyback already wrote it.
--
-- ROLLBACK: see PB-6-backfill-null-created-at.rollback.sql
-- =============================================================

BEGIN;

-- ─── Step 1: Capture affected rows for rollback ──────────────────

CREATE TABLE pb6_created_at_backfill_log (
  table_name TEXT NOT NULL,
  row_id     UUID NOT NULL,
  PRIMARY KEY (table_name, row_id)
);

INSERT INTO pb6_created_at_backfill_log (table_name, row_id)
  SELECT 'trades', id FROM trades WHERE created_at IS NULL;

INSERT INTO pb6_created_at_backfill_log (table_name, row_id)
  SELECT 'fee_earnings', id FROM fee_earnings WHERE created_at IS NULL;

-- ─── Step 2: Backfill trades ─────────────────────────────────────
-- No better timestamp source exists for trades (the on-chain tx
-- block timestamp would be ideal but is not stored locally).
-- NOW() is honest about the fact that we are filling in after the
-- fact, and is good enough for ordering / display purposes.

UPDATE trades
   SET created_at = NOW()
 WHERE created_at IS NULL;

-- ─── Step 3: Backfill fee_earnings ───────────────────────────────
-- For rows that have already been processed by executeTokenBuyback,
-- paid_at is the actual on-chain settlement time and is the better
-- proxy for "when this fee was real." Fall back to NOW() for rows
-- that are still 'pending' (paid_at IS NULL).

UPDATE fee_earnings
   SET created_at = COALESCE(paid_at, NOW())
 WHERE created_at IS NULL;

COMMIT;

-- ─── Verification (run after) ────────────────────────────────────
--
-- 1. No NULL created_at on trades or fee_earnings:
--    SELECT 'trades' AS t, COUNT(*) FROM trades WHERE created_at IS NULL
--    UNION ALL
--    SELECT 'fee_earnings', COUNT(*) FROM fee_earnings WHERE created_at IS NULL;
--    → expect: both rows = 0
--
-- 2. Backfill log records the affected rows:
--    SELECT table_name, COUNT(*) FROM pb6_created_at_backfill_log GROUP BY table_name;
--    → expect: one row per affected table with the count of rows fixed.
