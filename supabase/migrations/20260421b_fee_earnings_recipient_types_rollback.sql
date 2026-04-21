-- Rollback for 20260421b_fee_earnings_recipient_types.sql
-- DO NOT run unless intentionally reverting. This will FAIL if any rows
-- exist with recipient_type in ('holder_rewards_pool', 'auto_buy_pool').

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN ('platform', 'creator', 'market_creator'));
