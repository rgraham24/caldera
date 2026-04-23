-- Rollback for 20260423_fee_earnings_tx_hash.sql
-- Explicit safety checks: refuses to run if destroying this schema
-- would lose real data (status='failed' rows or on-chain tx references).
-- This is "do it right" guarding — don't rely on constraint violations
-- to stop a destructive rollback; check explicitly first.

DO $$
DECLARE
  failed_count int;
  tx_data_count int;
BEGIN
  SELECT COUNT(*) INTO failed_count
    FROM fee_earnings WHERE status = 'failed';
  IF failed_count > 0 THEN
    RAISE EXCEPTION
      'Cannot rollback: % fee_earnings rows have status=failed. Resolve or delete them before rolling back.',
      failed_count;
  END IF;

  SELECT COUNT(*) INTO tx_data_count
    FROM fee_earnings
    WHERE tx_hash IS NOT NULL OR failed_reason IS NOT NULL;
  IF tx_data_count > 0 THEN
    RAISE EXCEPTION
      'Cannot rollback: % fee_earnings rows have tx_hash or failed_reason set. Rolling back would destroy on-chain reference data.',
      tx_data_count;
  END IF;
END $$;

-- Safe to proceed.
DROP INDEX IF EXISTS idx_fee_earnings_tx_hash;
DROP INDEX IF EXISTS idx_fee_earnings_status_recipient;

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_status_check;

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_status_check
  CHECK (status IN ('pending', 'paid'));

ALTER TABLE fee_earnings
  DROP COLUMN IF EXISTS failed_reason,
  DROP COLUMN IF EXISTS tx_hash;
