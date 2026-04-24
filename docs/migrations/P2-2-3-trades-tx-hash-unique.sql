-- =============================================================
-- P2-2.3 — Enforce tx_hash uniqueness and non-nullability
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Pre-migration state (confirmed 2026-04-25):
--   - 53 trades total
--   - 40 trades with tx_hash IS NULL (legacy seed/test data)
--   - 0 duplicate tx_hash values among non-NULL rows
--   - Only existing index on trades: trades_pkey (id)
--
-- Post-migration state:
--   - All trades have a non-null tx_hash
--   - trades.tx_hash is UNIQUE (DB-level replay defense)
--   - Sentinel values identify legacy pre-verify rows
-- =============================================================

-- Step 1: Backfill legacy NULL rows with a sentinel.
-- Format: LEGACY-PRE-VERIFY-{uuid} — guaranteed unique because id is a UUID.
-- Easy to grep for in future audits.
UPDATE trades
SET tx_hash = 'LEGACY-PRE-VERIFY-' || id::text
WHERE tx_hash IS NULL;

-- Step 2: Add UNIQUE constraint. This implicitly creates a btree index
-- on tx_hash, which also accelerates future lookup-by-hash queries.
ALTER TABLE trades
  ADD CONSTRAINT trades_tx_hash_unique UNIQUE (tx_hash);

-- Step 3: Add NOT NULL constraint. All rows are now non-null after Step 1.
ALTER TABLE trades
  ALTER COLUMN tx_hash SET NOT NULL;

-- Verification queries (run after the above):
-- SELECT COUNT(*) FROM trades WHERE tx_hash IS NULL;
--   → expect 0
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'trades';
--   → expect trades_pkey AND trades_tx_hash_unique
-- SELECT COUNT(*) FROM trades WHERE tx_hash LIKE 'LEGACY-PRE-VERIFY-%';
--   → expect 40 (matches pre-migration null_count)
