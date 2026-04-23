-- Rollback for 20260422_fee_earnings_creator_escrow.sql
-- WARNING: fails if any rows exist with recipient_type = 'creator_escrow'

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN (
    'platform',
    'creator',
    'market_creator',
    'holder_rewards_pool',
    'auto_buy_pool'
  ));
