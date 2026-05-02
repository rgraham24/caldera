-- =============================================================
-- PB-2 — Narrow fee_earnings.recipient_type to v2 tokenomics.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Under v2 tokenomics (LOCKED 2026-05-01), every buy generates
-- exactly two fee_earnings rows:
--   - 'platform'           (1.0%)
--   - 'creator_auto_buy'   (1.0%)
--
-- The pre-v2 set ('platform', 'creator', 'market_creator',
-- 'holder_rewards_pool', 'auto_buy_pool') is collapsed to two:
--   - 'platform'           kept as-is
--   - 'auto_buy_pool'      renamed to 'creator_auto_buy'
--   - 'holder_rewards_pool' deleted (no v2 equivalent)
--   - 'creator'            deleted (legacy direct-payout, replaced by auto-buy)
--   - 'creator_escrow'     deleted. This was the unclaimed-creator slice
--                          routing under the 2026-04-21 tokenomics. Under v2
--                          (2026-05-01) the auto-bought coins ARE the
--                          creator's compensation, so creator_escrow has no
--                          live equivalent. Pre-flight diagnostic on
--                          production data found 2 such rows ($0.005 each)
--                          from old 4-bucket testing. Rows are preserved
--                          in fee_earnings_archive_2026_05.
--   - 'market_creator'     pre-v2 only, never written by v2 trade route;
--                          deleted if any rows exist (verification below)
--
-- Live rows are archived in fee_earnings_archive_2026_05 before
-- mutation. Archive table preserves an exact byte-for-byte copy
-- (CREATE TABLE … AS SELECT) so the rollback can restore by
-- INSERT FROM archive.
--
-- ROLLBACK: see PB-2-fee-earnings-recipient-types-v2.rollback.sql
-- =============================================================

-- ─── Step 0: Pre-flight diagnostics (read-only) ──────────────────
-- Run these BEFORE the rest of the migration to confirm the row
-- counts match expectations. If unexpected recipient_type values
-- appear, STOP and add them to Step 3's DELETE list before
-- proceeding — the new constraint in Step 5 will reject any
-- surviving row that is not 'platform' or 'creator_auto_buy'.
--
-- SELECT recipient_type, COUNT(*) FROM fee_earnings GROUP BY recipient_type;
-- SELECT COUNT(*) FROM fee_earnings;

-- ─── Step 1: Archive existing rows ───────────────────────────────
-- CREATE TABLE … AS SELECT preserves data only — not constraints,
-- not indexes, not RLS. That is intentional: the archive is a
-- frozen snapshot, not a working table. The rollback restores
-- data into a freshly-created live table.

CREATE TABLE fee_earnings_archive_2026_05 AS
  SELECT * FROM fee_earnings;

-- Verification (assert before the destructive steps below):
-- SELECT
--   (SELECT COUNT(*) FROM fee_earnings) AS live,
--   (SELECT COUNT(*) FROM fee_earnings_archive_2026_05) AS archived;
-- → expect: live = archived

-- ─── Step 2: Delete pre-v2 rows that have no v2 equivalent ───────

DELETE FROM fee_earnings
  WHERE recipient_type IN ('holder_rewards_pool', 'creator', 'market_creator', 'creator_escrow');

-- ─── Step 3: Rename auto_buy_pool → creator_auto_buy ─────────────
-- The semantic shift: under v1 the auto-buy bought a "relevant
-- token" (category coin / crypto coin / creator coin depending
-- on routing). Under v2 it always buys the market's creator's
-- DeSo coin. Existing rows already represent auto-buys; we
-- simply align the label with the new model.

UPDATE fee_earnings
  SET recipient_type = 'creator_auto_buy'
  WHERE recipient_type = 'auto_buy_pool';

-- ─── Step 4: Drop the old (wide) CHECK constraint ────────────────
-- Constraint name verified against
-- supabase/migrations/20260421b_fee_earnings_recipient_types.sql.

ALTER TABLE fee_earnings
  DROP CONSTRAINT IF EXISTS fee_earnings_recipient_type_check;

-- ─── Step 5: Add the new (narrow) CHECK constraint ───────────────

ALTER TABLE fee_earnings
  ADD CONSTRAINT fee_earnings_recipient_type_check
  CHECK (recipient_type IN ('platform', 'creator_auto_buy'));

-- ─── Step 6: Verification (run after) ────────────────────────────
--
-- 1. Only the two allowed types remain:
--    SELECT recipient_type, COUNT(*) FROM fee_earnings GROUP BY recipient_type;
--    → expect: ('platform', N1), ('creator_auto_buy', N2). No others.
--
-- 2. Constraint is active:
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conname = 'fee_earnings_recipient_type_check';
--    → expect: CHECK (recipient_type IN ('platform', 'creator_auto_buy'))
--
-- 3. Archive is intact:
--    SELECT COUNT(*) FROM fee_earnings_archive_2026_05;
--    → expect: original pre-migration row count
