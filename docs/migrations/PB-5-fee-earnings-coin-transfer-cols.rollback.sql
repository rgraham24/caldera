-- =============================================================
-- PB-5 ROLLBACK — Drop the coin-transfer tracking columns.
--
-- DO NOT run unless you are intentionally reverting PB-5.
--
-- Pre-conditions:
--   1. No code path may be writing to coin_transfer_* columns during
--      this rollback (i.e. trades route must have been reverted to
--      a pre-PB-5 build).
--
-- Safe to run even if columns are populated — DROP COLUMN deletes
-- the column data. If you need to preserve outcomes for forensic
-- analysis before dropping, snapshot first:
--
--   CREATE TABLE fee_earnings_coin_transfer_audit_2026_05 AS
--   SELECT id, recipient_type, source_id, coin_transfer_status,
--          coin_transfer_tx_hash, coin_transfer_at,
--          coin_transfer_failed_reason
--   FROM fee_earnings
--   WHERE coin_transfer_status IS NOT NULL;
-- =============================================================

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_coin_transfer_status_check;

ALTER TABLE fee_earnings DROP COLUMN IF EXISTS coin_transfer_status;
ALTER TABLE fee_earnings DROP COLUMN IF EXISTS coin_transfer_tx_hash;
ALTER TABLE fee_earnings DROP COLUMN IF EXISTS coin_transfer_at;
ALTER TABLE fee_earnings DROP COLUMN IF EXISTS coin_transfer_failed_reason;

-- ─── Verification ────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'fee_earnings'
--     AND column_name LIKE 'coin_transfer%';
-- → expect 0 rows
