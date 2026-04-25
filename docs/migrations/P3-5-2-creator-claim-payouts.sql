-- =============================================================
-- P3-5.2 — Schema changes for creator claim payout flow
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Three additions:
--   1. creator_claim_payouts table (append-only audit ledger)
--   2. Indexes including partial UNIQUE for idempotency (CLAIM-7)
--   3. mark_creator_claim_complete RPC (atomic ledger transition)
--
-- Pre-migration state (verified 2026-04-26):
--   - creators.id is uuid NOT NULL PRIMARY KEY
--   - creator_claim_payouts does not exist
--   - mark_creator_claim_complete does not exist
--   - creators table has RLS disabled, no policies
--
-- Post-migration:
--   - New audit table for all creator claim attempts (forever)
--   - Idempotency: only ONE active (pending|in_flight) row per creator
--   - Atomic ledger transition via single RPC call
-- =============================================================

-- ─── Step 1: Create creator_claim_payouts table ─────────────

CREATE TABLE creator_claim_payouts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id                  UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  slug                        TEXT NOT NULL,
  recipient_deso_public_key   TEXT NOT NULL,
  escrow_amount_at_claim_usd  NUMERIC(20,8) NOT NULL,
  amount_nanos                BIGINT NOT NULL,
  deso_usd_rate_at_claim      NUMERIC(20,8) NOT NULL,
  status                      TEXT NOT NULL CHECK (status IN (
                                'pending', 'in_flight', 'claimed',
                                'failed', 'blocked_insolvent'
                              )),
  tx_hash                     TEXT,
  error_reason                TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ
);

COMMENT ON TABLE creator_claim_payouts IS
  'Append-only audit ledger of creator claim attempts. Never UPDATE or DELETE rows; only INSERT new ones and UPDATE status/tx_hash/completed_at on existing in_flight rows. P3-5.';

COMMENT ON COLUMN creator_claim_payouts.escrow_amount_at_claim_usd IS
  'Snapshot of creators.unclaimed_earnings_escrow at the moment claim started. Used for total_creator_earnings bump.';

COMMENT ON COLUMN creator_claim_payouts.amount_nanos IS
  'DESO nanos sent on-chain. escrow_amount / deso_usd_rate * 1e9 with floor.';

-- ─── Step 2: Indexes ────────────────────────────────────────

-- Idempotency: only ONE active (pending or in_flight) claim per creator.
-- This is the linchpin of CLAIM-7 — concurrent INSERT attempts for the
-- same creator will hit unique violation; route catches as 409.
CREATE UNIQUE INDEX uq_creator_claim_payouts_active
  ON creator_claim_payouts (creator_id)
  WHERE status IN ('pending', 'in_flight');

-- Hot path: lookup recent claims for a slug
CREATE INDEX idx_creator_claim_payouts_slug_status
  ON creator_claim_payouts (slug, status, created_at DESC);

-- Audit trail: all claims for a creator, recent first
CREATE INDEX idx_creator_claim_payouts_creator_recent
  ON creator_claim_payouts (creator_id, created_at DESC);

-- ─── Step 3: Atomic ledger-transition RPC ────────────────────
--
-- Called by /api/creators/[slug]/claim AFTER successful on-chain
-- DESO send. Wraps three UPDATEs in a single transaction:
--   1. Zero unclaimed_earnings_escrow on creators
--   2. Bump total_creator_earnings by the claimed amount
--   3. Mark the audit row claimed with tx_hash
--
-- All three succeed or all three roll back. No window where
-- escrow=0 but audit row says in_flight.

CREATE OR REPLACE FUNCTION mark_creator_claim_complete(
  p_audit_id        UUID,
  p_creator_id      UUID,
  p_escrow_usd      NUMERIC,
  p_tx_hash         TEXT
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- Atomic transaction is implicit inside a function body.
  -- Any RAISE EXCEPTION rolls back all changes.

  UPDATE creators
    SET unclaimed_earnings_escrow = 0,
        total_creator_earnings    = COALESCE(total_creator_earnings, 0) + p_escrow_usd,
        claimed_at                = COALESCE(claimed_at, NOW())
    WHERE id = p_creator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator-not-found: %', p_creator_id;
  END IF;

  UPDATE creator_claim_payouts
    SET status        = 'claimed',
        tx_hash       = p_tx_hash,
        completed_at  = NOW()
    WHERE id     = p_audit_id
      AND status = 'in_flight';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit-row-not-in-flight: %', p_audit_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION mark_creator_claim_complete IS
  'P3-5.2 — Atomic transition: zero escrow + bump total_creator_earnings + mark audit row claimed. Called by /api/creators/[slug]/claim after on-chain confirmation. Errors raised inside roll back all changes.';

-- ─── Verification queries (run after the above) ──────────────
--
-- 1. Table exists with all columns:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'creator_claim_payouts' ORDER BY ordinal_position;
--    → expect: 12 columns
--
-- 2. Indexes:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'creator_claim_payouts';
--    → expect: pkey + 3 named indexes (incl partial unique)
--
-- 3. Function exists:
--    SELECT proname FROM pg_proc
--    WHERE proname = 'mark_creator_claim_complete';
--    → expect: 1 row
--
-- 4. Idempotency unique index works (test in psql, not for prod):
--    -- INSERT INTO creator_claim_payouts (creator_id, slug,
--    --   recipient_deso_public_key, escrow_amount_at_claim_usd,
--    --   amount_nanos, deso_usd_rate_at_claim, status)
--    -- VALUES ('<some_creator_id>', 'test', 'BC1Y...', 0.01, 100, 5,
--    --         'in_flight');
--    -- (Then try a second INSERT with same creator_id and status.
--    -- Expect: ERROR: duplicate key value violates unique constraint
--    --   "uq_creator_claim_payouts_active")
