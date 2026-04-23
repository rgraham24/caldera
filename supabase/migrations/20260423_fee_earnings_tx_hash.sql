-- Migration: Expand fee_earnings for on-chain transaction tracking
-- Date: 2026-04-23
-- Reason: Step 3d.1 of tokenomics-v2. Every auto_buy_pool fee_earnings
-- row will eventually correspond to a real DeSo transaction. We need
-- to (a) store the tx hash for on-chain verifiability, (b) record
-- failure reasons when the DeSo call fails, and (c) extend the status
-- enum to include 'failed' — previously only 'pending' and 'paid'.
--
-- Rationale: "do it right" principle (see project DECISIONS). A
-- fee ledger that can't distinguish paid / failed / pending is not
-- a usable ledger.
--
-- Additive changes only; existing rows default to NULL on new
-- columns and keep their current status values.

-- Add columns
ALTER TABLE fee_earnings
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS failed_reason text;

-- Update the status CHECK constraint to allow 'failed'
ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_status_check;

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_status_check
  CHECK (status IN ('pending', 'paid', 'failed'));

-- Index on tx_hash for lookups by blockchain tx (rare but useful for
-- reconciliation / support queries like "find the fee row for this tx")
CREATE INDEX IF NOT EXISTS idx_fee_earnings_tx_hash
  ON fee_earnings (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- Index on (status, recipient_type) for operational queries like
-- "show me all failed auto_buy_pool rows from the last 24h"
CREATE INDEX IF NOT EXISTS idx_fee_earnings_status_recipient
  ON fee_earnings (status, recipient_type, created_at DESC);

-- Column comments for future-me / other contributors
COMMENT ON COLUMN fee_earnings.tx_hash IS
  'DeSo transaction hash for on-chain fee operations (auto_buy_pool
  mostly; could extend to creator payouts in future). NULL for
  off-chain/escrow operations.';

COMMENT ON COLUMN fee_earnings.failed_reason IS
  'Human-readable error message set when status transitions to ''failed''.
  Populated by the caller that attempted the on-chain or escrow
  operation. NULL otherwise.';
