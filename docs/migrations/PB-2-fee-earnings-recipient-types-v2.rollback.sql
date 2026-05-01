-- =============================================================
-- PB-2 ROLLBACK — Restore fee_earnings to its pre-PB-2 state.
--
-- DO NOT run unless you are intentionally reverting PB-2.
--
-- This rollback wipes the live fee_earnings table and restores
-- it byte-for-byte from fee_earnings_archive_2026_05. It also
-- restores the pre-PB-2 (wide) CHECK constraint that allowed
-- the five legacy recipient_type values.
--
-- Pre-conditions:
--   1. fee_earnings_archive_2026_05 must exist with the original
--      pre-PB-2 row count.
--   2. No code path may be writing v2 rows to fee_earnings during
--      this rollback (i.e. the trades/route.ts cutover from
--      atomic_record_trade_v2 must have been reverted first).
-- =============================================================

-- ─── Step 1: Drop the v2 (narrow) constraint ─────────────────────

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

-- ─── Step 2: Truncate live table ─────────────────────────────────
-- DELETE rather than TRUNCATE so that any FK references from
-- other tables to fee_earnings rows are surfaced via constraint
-- errors instead of silently breaking. (No FKs reference
-- fee_earnings today, but the safer form costs nothing.)

DELETE FROM fee_earnings;

-- ─── Step 3: Restore from archive ────────────────────────────────

INSERT INTO fee_earnings
  SELECT * FROM fee_earnings_archive_2026_05;

-- ─── Step 4: Re-add the pre-PB-2 (wide) constraint ───────────────
-- Restored verbatim from supabase/migrations/20260421b_fee_earnings_recipient_types.sql.

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN (
    'platform',
    'creator',
    'market_creator',
    'holder_rewards_pool',
    'auto_buy_pool'
  ));

-- ─── Step 5: Verification ────────────────────────────────────────
--
-- Live row count matches archive:
--   SELECT
--     (SELECT COUNT(*) FROM fee_earnings) AS live,
--     (SELECT COUNT(*) FROM fee_earnings_archive_2026_05) AS archived;
--   → expect: live = archived
--
-- Constraint matches the pre-PB-2 form:
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'fee_earnings_recipient_type_check';
--   → expect: CHECK (recipient_type IN ('platform','creator','market_creator','holder_rewards_pool','auto_buy_pool'))
--
-- After verifying, the archive can be dropped manually if desired:
--   DROP TABLE fee_earnings_archive_2026_05;
