-- Migration: Holder Rewards Ledger + Escrow Rollover Tracking
-- Date: 2026-04-21
-- Locked tokenomics (see DECISIONS.md 2026-04-21):
--   Sells: 0%. Buys: 2.5%. Split: 1% platform, 0.5% holder rewards,
--   0.5% auto-buy, 0.5% creator slice.
--
-- This migration:
--   1. Creates holder_rewards ledger (per-holder-per-token accrual)
--   2. Adds rollover tracking columns to creators (for 12mo escrow rule)
--   3. Additive only -- no drops, no renames. Safe to run in production.

-- --- 1. holder_rewards ledger ------------------------------------

CREATE TABLE IF NOT EXISTS holder_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who earned it
  holder_deso_public_key text NOT NULL,

  -- Which token generated the reward
  token_slug text NOT NULL,
  token_type text NOT NULL,  -- 'category' | 'crypto' | 'creator'

  -- Amount accrued (in USD; deso_nanos snapshot at accrual time)
  amount_usd numeric(20, 8) NOT NULL CHECK (amount_usd >= 0),
  amount_deso_nanos bigint,
  deso_usd_rate_at_accrual numeric(12, 4),

  -- Traceability
  trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,

  -- Accrual snapshot: what was this holder's balance at the moment of accrual?
  holder_coins_at_accrual numeric(20, 8),
  total_coins_at_accrual numeric(20, 8),

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz,
  claimed_tx_hash text,
  claimed_amount_deso_nanos bigint,

  -- Rollover tracking (for 12-month escrow-to-category-rewards flow)
  rolled_from_escrow_creator_id uuid REFERENCES creators(id) ON DELETE SET NULL,

  accrued_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT holder_rewards_status_check
    CHECK (status IN ('pending', 'claimed', 'expired')),
  CONSTRAINT holder_rewards_token_type_check
    CHECK (token_type IN ('category', 'crypto', 'creator'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_holder_rewards_holder_status
  ON holder_rewards(holder_deso_public_key, status);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_token
  ON holder_rewards(token_slug, status);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_trade
  ON holder_rewards(trade_id);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_accrued_at
  ON holder_rewards(accrued_at DESC);

-- --- 2. Escrow rollover tracking on creators ---------------------

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS unclaimed_escrow_first_accrued_at timestamptz;

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS unclaimed_escrow_rolled_over_at timestamptz;

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS unclaimed_escrow_rolled_over_total numeric(20, 8)
  DEFAULT 0;

-- --- 3. Row-level security ---------------------------------------

ALTER TABLE holder_rewards ENABLE ROW LEVEL SECURITY;

-- Holders can read their own rewards (read-only, authenticated)
CREATE POLICY "holders_read_own_rewards"
  ON holder_rewards FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND holder_deso_public_key = (
      SELECT deso_public_key FROM users WHERE id = auth.uid()
    )
  );

-- All writes must come from server-side routes using SUPABASE_SERVICE_ROLE_KEY.
-- Service role bypasses RLS, so no write policy is needed. Never write to this
-- table from the client.

-- --- 4. Documentation --------------------------------------------

COMMENT ON TABLE holder_rewards IS
  'Ledger of accrued rewards per token holder. Populated by trade route, claimed via /api/rewards/claim. See DECISIONS.md 2026-04-21 for model.';

COMMENT ON COLUMN holder_rewards.token_type IS
  'category = $CalderaSports etc, crypto = $Bitcoin etc, creator = individual creator coin';

COMMENT ON COLUMN holder_rewards.status IS
  'pending = accrued not claimed, claimed = paid out to holder, expired = reserved for future use';
