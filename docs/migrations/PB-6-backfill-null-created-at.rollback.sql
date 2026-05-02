-- =============================================================
-- PB-6 ROLLBACK — Re-NULL the rows backfilled by PB-6.
--
-- DO NOT run unless you are intentionally reverting PB-6.
--
-- Restoring the original NULL created_at is intentionally narrow:
-- only rows whose IDs are recorded in pb6_created_at_backfill_log
-- get re-NULL'd. Rows inserted AFTER PB-6 ran (via the fixed
-- atomic_record_trade_v2) are not in the log and remain untouched.
--
-- Pre-conditions:
--   1. pb6_created_at_backfill_log must exist with the original
--      row IDs captured by PB-6.
-- =============================================================

BEGIN;

UPDATE trades
   SET created_at = NULL
 WHERE id IN (
   SELECT row_id FROM pb6_created_at_backfill_log WHERE table_name = 'trades'
 );

UPDATE fee_earnings
   SET created_at = NULL
 WHERE id IN (
   SELECT row_id FROM pb6_created_at_backfill_log WHERE table_name = 'fee_earnings'
 );

DROP TABLE pb6_created_at_backfill_log;

COMMIT;

-- ─── Verification (run after) ────────────────────────────────────
--
-- The rollback restores the broken state. Confirm:
--   SELECT 'trades' AS t, COUNT(*) FROM trades WHERE created_at IS NULL
--   UNION ALL
--   SELECT 'fee_earnings', COUNT(*) FROM fee_earnings WHERE created_at IS NULL;
-- → expect: counts match the pb6_created_at_backfill_log totals
--   captured at PB-6 run time.
--
-- The pb6_created_at_backfill_log table is dropped by this rollback,
-- so a second rollback would be a no-op.
