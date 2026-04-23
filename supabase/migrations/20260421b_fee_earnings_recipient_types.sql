-- Migration: Expand fee_earnings.recipient_type CHECK constraint
-- Date: 2026-04-21
-- Reason: Locked tokenomics v2 adds two new recipient_type values:
--   'holder_rewards_pool' — 0.5% slice routed to holders of the relevant token
--   'auto_buy_pool'       — 0.5% slice used to auto-buy the relevant token on DeSo
-- The existing constraint only allowed ('platform', 'creator', 'market_creator'),
-- causing silent insert failures until now. See DECISIONS.md 2026-04-21.

-- Drop the old constraint
ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

-- Recreate with expanded set. 'market_creator' kept for historical rows even
-- though v2 trade route doesn't write new ones (market creator fees were folded
-- into platform's 1% in the v2 split).
ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN (
    'platform',
    'creator',
    'market_creator',
    'holder_rewards_pool',
    'auto_buy_pool'
  ));
