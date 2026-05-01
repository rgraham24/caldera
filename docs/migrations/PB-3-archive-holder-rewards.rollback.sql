-- =============================================================
-- PB-3 ROLLBACK — Restore the holder_rewards table from archive.
--
-- DO NOT run unless you are intentionally reverting PB-3.
--
-- Recreates the full schema (table + columns + CHECK constraints
-- + indexes + RLS policies + comments) from
-- supabase/migrations/20260421_holder_rewards.sql and the unique
-- index from 20260423_holder_rewards_unique_constraint.sql, then
-- restores rows from holder_rewards_archive_2026_05.
--
-- Pre-conditions:
--   1. holder_rewards_archive_2026_05 must exist with the original
--      pre-PB-3 row count.
--   2. The escrow tracking columns on `creators`
--      (unclaimed_escrow_first_accrued_at,
--       unclaimed_escrow_rolled_over_at,
--       unclaimed_escrow_rolled_over_total) were added by
--      20260421_holder_rewards.sql but are NOT dropped by PB-3,
--      so this rollback does not need to re-add them.
-- =============================================================

-- ─── Step 1: Recreate the live table ─────────────────────────────

CREATE TABLE holder_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  holder_deso_public_key text NOT NULL,

  token_slug text NOT NULL,
  token_type text NOT NULL,

  amount_usd numeric(20, 8) NOT NULL CHECK (amount_usd >= 0),
  amount_deso_nanos bigint,
  deso_usd_rate_at_accrual numeric(12, 4),

  trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,

  holder_coins_at_accrual numeric(20, 8),
  total_coins_at_accrual numeric(20, 8),

  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz,
  claimed_tx_hash text,
  claimed_amount_deso_nanos bigint,

  rolled_from_escrow_creator_id uuid REFERENCES creators(id) ON DELETE SET NULL,

  accrued_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT holder_rewards_status_check
    CHECK (status IN ('pending', 'claimed', 'expired')),
  CONSTRAINT holder_rewards_token_type_check
    CHECK (token_type IN ('category', 'crypto', 'creator'))
);

-- ─── Step 2: Recreate indexes ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_holder_rewards_holder_status
  ON holder_rewards(holder_deso_public_key, status);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_token
  ON holder_rewards(token_slug, status);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_trade
  ON holder_rewards(trade_id);

CREATE INDEX IF NOT EXISTS idx_holder_rewards_accrued_at
  ON holder_rewards(accrued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holder_rewards_trade_holder
  ON holder_rewards (trade_id, holder_deso_public_key)
  WHERE trade_id IS NOT NULL
    AND rolled_from_escrow_creator_id IS NULL;

-- ─── Step 3: Re-enable RLS and re-create the read policy ─────────

ALTER TABLE holder_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holders_read_own_rewards"
  ON holder_rewards FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND holder_deso_public_key = (
      SELECT deso_public_key FROM users WHERE id = auth.uid()
    )
  );

-- ─── Step 4: Restore rows from archive ───────────────────────────

INSERT INTO holder_rewards
  SELECT * FROM holder_rewards_archive_2026_05;

-- ─── Step 5: Restore comments ────────────────────────────────────

COMMENT ON TABLE holder_rewards IS
  'Ledger of accrued rewards per token holder. Populated by trade route, claimed via /api/rewards/claim. See DECISIONS.md 2026-04-21 for model.';

COMMENT ON COLUMN holder_rewards.token_type IS
  'category = $CalderaSports etc, crypto = $Bitcoin etc, creator = individual creator coin';

COMMENT ON COLUMN holder_rewards.status IS
  'pending = accrued not claimed, claimed = paid out to holder, expired = reserved for future use';

COMMENT ON INDEX uq_holder_rewards_trade_holder IS
  'Prevents the same holder being credited twice for the same trade. Applies only to trade-driven rows; escrow-rollover rows have different uniqueness semantics and are explicitly excluded via the partial index clause.';

-- ─── Step 6: Verification ────────────────────────────────────────
--
-- Live row count matches archive:
--   SELECT
--     (SELECT COUNT(*) FROM holder_rewards) AS live,
--     (SELECT COUNT(*) FROM holder_rewards_archive_2026_05) AS archived;
--   → expect: live = archived
--
-- After verifying, the archive can be dropped manually if desired:
--   DROP TABLE holder_rewards_archive_2026_05;
