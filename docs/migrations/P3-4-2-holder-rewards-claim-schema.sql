-- =============================================================
-- P3-4.2 — Schema changes for holder rewards claim flow
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Three non-destructive changes:
--   1. Expand status CHECK constraint to allow new state machine values
--   2. Add composite index on (holder, token_slug, status) for claim hot-path
--   3. Create SQL view v_holder_rewards_pending_by_user for /balance route
--
-- Pre-migration state (verified 2026-04-26):
--   - holder_rewards has 350 rows, all status='pending'
--   - Existing status CHECK constraint: holder_rewards_status_check
--     Current allowed values: 'pending', 'claimed', 'expired'
--     Note: 'expired' is in the constraint but zero rows use it.
--     It is intentionally dropped in the new constraint — the P3-4
--     state machine uses 'abandoned' as the terminal admin-sweep value
--     instead. 'claimed' was already present; kept.
--   - amount_creator_coin_nanos column exists (P2-4.3) but unpopulated
--
-- Post-migration:
--   - Status can be: pending | in_flight | claimed | failed |
--                    blocked_insolvent | abandoned
--   - New index speeds up claim and /balance endpoint
--   - View enables clean GET /api/holder-rewards/balance implementation
-- =============================================================

-- ─── Step 1: Update status CHECK constraint ─────────────────
-- Drops existing constraint (holder_rewards_status_check) and
-- recreates with expanded allowed values.
--
-- Dropping 'expired': zero rows currently use this value (verified
-- 2026-04-26). The new state machine uses 'abandoned' instead.
-- If any rows had status='expired' this drop would fail — run the
-- verification query first:
--   SELECT COUNT(*) FROM holder_rewards WHERE status = 'expired';
--   → must be 0 before proceeding

ALTER TABLE holder_rewards
  DROP CONSTRAINT IF EXISTS holder_rewards_status_check;

ALTER TABLE holder_rewards
  ADD CONSTRAINT holder_rewards_status_check
  CHECK (status IN (
    'pending',
    'in_flight',
    'claimed',
    'failed',
    'blocked_insolvent',
    'abandoned'
  ));

-- ─── Step 2: Composite index for claim hot path ─────────────
-- Both /api/holder-rewards/balance (group by) and
-- /api/holder-rewards/claim (filter) hit this prefix.
-- Existing idx_holder_rewards_holder_status covers (holder, status)
-- but not token_slug — this new index replaces that query pattern.

CREATE INDEX IF NOT EXISTS idx_holder_rewards_holder_token_status
  ON holder_rewards (holder_deso_public_key, token_slug, status);

-- ─── Step 3: Pending-rewards aggregation view ───────────────
-- Used by GET /api/holder-rewards/balance. Joins to creators table
-- happen at API layer for display metadata (deso_public_key,
-- display_label).

CREATE OR REPLACE VIEW v_holder_rewards_pending_by_user AS
SELECT
  hr.holder_deso_public_key,
  hr.token_slug,
  hr.token_type,
  COUNT(*)                    AS row_count,
  SUM(hr.amount_usd)::text    AS total_usd
FROM holder_rewards hr
WHERE hr.status = 'pending'
GROUP BY
  hr.holder_deso_public_key,
  hr.token_slug,
  hr.token_type;

-- ─── Verification queries (run after the above) ──────────────
--
-- 1. CHECK constraint allows new values:
--    SELECT pg_get_constraintdef(con.oid)
--    FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
--    WHERE rel.relname='holder_rewards' AND con.contype='c'
--      AND con.conname='holder_rewards_status_check';
--    → expect: CHECK (status = ANY (ARRAY['pending'::text,
--              'in_flight'::text, 'claimed'::text, 'failed'::text,
--              'blocked_insolvent'::text, 'abandoned'::text]))
--
-- 2. New index present:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename='holder_rewards'
--      AND indexname='idx_holder_rewards_holder_token_status';
--    → expect: 1 row
--
-- 3. View created:
--    SELECT * FROM v_holder_rewards_pending_by_user LIMIT 5;
--    → expect: rows aggregating today's 350 pending records
--
-- 4. No existing rows broken:
--    SELECT COUNT(*) FROM holder_rewards WHERE status NOT IN
--      ('pending','in_flight','claimed','failed','blocked_insolvent','abandoned');
--    → expect: 0
