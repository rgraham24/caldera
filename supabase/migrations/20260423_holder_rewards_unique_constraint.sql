-- Migration: Prevent double-writes to holder_rewards for the same (trade, holder)
-- Date: 2026-04-23
-- Reason: Step 3c.3 fire-and-forget snapshots could run twice on retry or
-- serverless cold-start weirdness. A unique constraint on (trade_id,
-- holder_deso_public_key) makes double-writes impossible at the DB level,
-- regardless of whether the calling code is correct.
--
-- Additional insurance beyond application-layer idempotency — the DB becomes
-- the single source of truth for "this holder got their share for this trade."
--
-- Rolled-over rows (rolled_from_escrow_creator_id IS NOT NULL) are scoped
-- differently (one creator's escrow rolls to many holders), so they use a
-- different uniqueness scope and are allowed null trade_id. The partial
-- uniqueness below targets only trade-driven rows.

CREATE UNIQUE INDEX IF NOT EXISTS uq_holder_rewards_trade_holder
  ON holder_rewards (trade_id, holder_deso_public_key)
  WHERE trade_id IS NOT NULL
    AND rolled_from_escrow_creator_id IS NULL;

COMMENT ON INDEX uq_holder_rewards_trade_holder IS
  'Prevents the same holder being credited twice for the same trade. Applies
  only to trade-driven rows; escrow-rollover rows have different uniqueness
  semantics and are explicitly excluded via the partial index clause.';
