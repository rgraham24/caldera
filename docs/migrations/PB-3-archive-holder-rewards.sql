-- =============================================================
-- PB-3 — Archive and drop the holder_rewards table.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- v2 tokenomics (LOCKED 2026-05-01) deletes the holder-rewards
-- system entirely. No more 0.5% holder-rewards slice. No more
-- per-trade snapshotting. No more pull-claim flow.
--
-- Per AUDIT_MONEY_FLOWS.md, the holder_rewards table is expected
-- to contain zero claimed rows; existing pending rows (if any)
-- are preserved in fee_earnings via the v1 ledger and are out of
-- scope here.
--
-- ROLLBACK: see PB-3-archive-holder-rewards.rollback.sql
-- =============================================================

-- ─── Step 0: Pre-flight diagnostics (read-only) ──────────────────
-- SELECT status, COUNT(*) FROM holder_rewards GROUP BY status;
-- SELECT COUNT(*) FROM holder_rewards;

-- ─── Step 1: Archive existing rows ───────────────────────────────
-- CREATE TABLE … AS SELECT preserves data only — not constraints,
-- not indexes, not RLS. The archive is a frozen snapshot. The
-- rollback restores into a freshly-created live table with the
-- original schema re-applied.

CREATE TABLE holder_rewards_archive_2026_05 AS
  SELECT * FROM holder_rewards;

-- Verification (assert before the destructive step below):
-- SELECT
--   (SELECT COUNT(*) FROM holder_rewards) AS live,
--   (SELECT COUNT(*) FROM holder_rewards_archive_2026_05) AS archived;
-- → expect: live = archived

-- ─── Step 2: Drop the live table ────────────────────────────────
-- CASCADE handles the unique constraint (added by
-- 20260423_holder_rewards_unique_constraint.sql) and any FKs that
-- reference holder_rewards. As of 2026-05-01 no other table FKs
-- into holder_rewards, so CASCADE is functionally identical to
-- RESTRICT here, but the explicit CASCADE is documented for
-- safety against schema drift.

DROP TABLE holder_rewards CASCADE;

-- ─── Step 3: Verification ────────────────────────────────────────
--
-- 1. Live table is gone:
--    SELECT to_regclass('public.holder_rewards');
--    → expect: NULL
--
-- 2. Archive is intact:
--    SELECT COUNT(*) FROM holder_rewards_archive_2026_05;
--    → expect: original pre-migration row count
