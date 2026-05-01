-- =============================================================
-- PB-5 — Add coin-transfer tracking columns to fee_earnings.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Under v2 tokenomics, the 1% creator-coin auto-buy is followed (for
-- claimed creators) by a transfer of the bought coins from the
-- platform wallet to the creator's wallet. These columns track the
-- outcome of that transfer step independently of the buyback step
-- (whose status is already tracked via fee_earnings.status +
-- fee_earnings.tx_hash).
--
-- Column semantics:
--
--   coin_transfer_status (text, NULLABLE):
--     NULL          → no transfer attempted. Two cases:
--                     (a) buyback failed (fee_earnings.status='failed')
--                     (b) creator is unclaimed; coins held in platform
--                         wallet as a claim bounty
--     'transferred' → transfer succeeded
--     'transfer_failed' → transfer was attempted and failed; reconciliation will retry
--     'skipped_no_amount' → buyback succeeded but ExpectedCreatorCoinReturnedNanos
--                           was 0 or null (malformed coin / frozen profile / etc).
--                           Reconciliation can investigate the underlying cause.
--
--   coin_transfer_tx_hash (text, NULLABLE):
--     The DeSo TransferCreatorCoin tx hash on success.
--
--   coin_transfer_at (timestamptz, NULLABLE):
--     UTC timestamp of the transfer outcome (success OR failure write).
--
--   coin_transfer_failed_reason (text, NULLABLE):
--     Free-form failure reason on transfer_failed. NULL otherwise.
--
-- Additive only. No data backfill needed — existing rows have all four
-- columns NULL by default.
--
-- ROLLBACK: see PB-5-fee-earnings-coin-transfer-cols.rollback.sql
-- =============================================================

ALTER TABLE fee_earnings
  ADD COLUMN IF NOT EXISTS coin_transfer_status TEXT;

ALTER TABLE fee_earnings
  ADD COLUMN IF NOT EXISTS coin_transfer_tx_hash TEXT;

ALTER TABLE fee_earnings
  ADD COLUMN IF NOT EXISTS coin_transfer_at TIMESTAMPTZ;

ALTER TABLE fee_earnings
  ADD COLUMN IF NOT EXISTS coin_transfer_failed_reason TEXT;

-- Optional: a CHECK constraint to enforce the small enum-like value set
-- on coin_transfer_status. Keeping it loose (no constraint) so future
-- additions don't require a migration; column comments are the contract.

COMMENT ON COLUMN fee_earnings.coin_transfer_status IS
  'PB-5 — Outcome of the post-buyback transfer to a claimed creator. NULL means no transfer was attempted (either buyback failed, or creator is unclaimed). Values: ''transferred'' | ''transfer_failed'' | ''skipped_no_amount''.';

COMMENT ON COLUMN fee_earnings.coin_transfer_tx_hash IS
  'PB-5 — DeSo TransferCreatorCoin tx hash on successful transfer.';

COMMENT ON COLUMN fee_earnings.coin_transfer_at IS
  'PB-5 — UTC timestamp of the transfer outcome write (success OR failure).';

COMMENT ON COLUMN fee_earnings.coin_transfer_failed_reason IS
  'PB-5 — Free-form failure reason when coin_transfer_status=''transfer_failed''. NULL otherwise.';

-- ─── Verification ────────────────────────────────────────────────
-- All four columns exist and are nullable:
--   SELECT column_name, is_nullable, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'fee_earnings'
--     AND column_name LIKE 'coin_transfer%'
--   ORDER BY column_name;
--
-- → expect 4 rows, all is_nullable='YES'.
