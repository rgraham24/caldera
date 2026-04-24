-- =============================================================
-- P2-4.3 — Add amount_creator_coin_nanos to holder_rewards
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Pre-migration state (confirmed 2026-04-26):
--   - holder_rewards has 16 columns, incl amount_usd (NOT NULL) and
--     legacy amount_deso_nanos (nullable, kept for history)
--   - 350 pending rows, 88 distinct holders, $0.02 total accrued
--
-- Post-migration state:
--   - New nullable column: amount_creator_coin_nanos bigint
--   - Existing rows stay NULL (no backfill — their value is
--     unknown/legacy, not zero)
--   - Future code (Phase 3 Path 4, holder rewards claim) will
--     populate this column on accrual and/or at claim time
--
-- Why now, before Phase 3 Path 4 wires it up:
--   Schema matches locked tokenomics-v2 decision (pay creator
--   coins, not DESO). Having the column present lets Phase 3 Path
--   4 start writing to it immediately without a separate migration.
-- =============================================================

-- Step 1: Add the new column (nullable, no default, no constraint).
ALTER TABLE holder_rewards
  ADD COLUMN amount_creator_coin_nanos bigint;

-- Verification queries (run after the above):
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'holder_rewards'
--   AND column_name = 'amount_creator_coin_nanos';
-- → expect 1 row: (amount_creator_coin_nanos, bigint, YES, NULL)
--
-- SELECT COUNT(*) FROM holder_rewards WHERE amount_creator_coin_nanos IS NULL;
-- → expect 350 (all existing rows — unchanged)
--
-- SELECT COUNT(*) FROM holder_rewards;
-- → expect 350 (unchanged — no rows added or removed)
