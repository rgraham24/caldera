-- Migration: Add 'creator_escrow' to fee_earnings.recipient_type CHECK constraint
-- Date: 2026-04-22
-- Reason: Step 3b of tokenomics-v2 routes unclaimed-creator slices to
-- creators.unclaimed_earnings_escrow AND mirrors the accrual as a
-- fee_earnings row for unified audit trail.
-- See DECISIONS.md 2026-04-21 for rationale.

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN (
    'platform',
    'creator',
    'creator_escrow',
    'market_creator',
    'holder_rewards_pool',
    'auto_buy_pool'
  ));
