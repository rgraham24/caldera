-- =============================================================
-- PB-8 — D-3 #5: mark migration-window orphan creator_auto_buy rows as failed.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Phase D-3 #5 ran this in production on 2026-05-02. It cleans up
-- 3 orphan fee_earnings rows where:
--   - recipient_type = 'creator_auto_buy'
--   - status IS NULL (never wrote back)
--   - tx_hash IS NULL (no on-chain action)
--
-- These rows were inserted during the chaotic PB-1/PB-2 migration window
-- where the trade route fire-and-forget buyback was being killed by Vercel's
-- serverless runtime before any DeSo network call could fire. Total economic
-- impact: $0.025 across 3 trades on Kai Cenat / Drake markets — pre-launch
-- test data, no real users affected.
--
-- The rows are not retryable because there's no idempotent way to know
-- whether the buyback partially fired (it didn't — but the route doesn't
-- know that, and a retry might double-spend if it had).
--
-- We use status='failed' (the only allowed CHECK value besides pending/paid)
-- with failed_reason='abandoned: pre-PB-1 migration-window orphan. ...' to
-- preserve the "not retryable" semantic.
--
-- Pre-mutation snapshot:
--   fee_earnings_archive_d3_5_abandoned_2026_05 (3 rows)
--
-- Verified at execution time:
--   archived_count: 3
--   remaining_stuck: 0
--   now_marked_failed: 3
--
-- ROLLBACK: see PB-8-d3-5-abandon-stuck-rows.rollback.sql
-- =============================================================

BEGIN;

CREATE TABLE fee_earnings_archive_d3_5_abandoned_2026_05 AS
  SELECT * FROM fee_earnings
  WHERE id IN (
    '38b71d82-c283-4876-a0ae-51ec9b051fc3',
    'b7780242-288a-4c75-8c35-fa0cef704537',
    '6f4092fd-74a1-4ff6-ae77-0bd46f65f0c4'
  );

UPDATE fee_earnings
   SET status = 'failed',
       failed_reason = 'abandoned: pre-PB-1 migration-window orphan. Buyback fire-and-forget never wrote back; not retryable. $0.025 total economic impact.',
       paid_at = NOW()
 WHERE id IN (
   '38b71d82-c283-4876-a0ae-51ec9b051fc3',
   'b7780242-288a-4c75-8c35-fa0cef704537',
   '6f4092fd-74a1-4ff6-ae77-0bd46f65f0c4'
 );

SELECT
  (SELECT COUNT(*) FROM fee_earnings_archive_d3_5_abandoned_2026_05) AS archived_count,
  (SELECT COUNT(*) FROM fee_earnings WHERE recipient_type='creator_auto_buy' AND status IS NULL AND tx_hash IS NULL) AS remaining_stuck,
  (SELECT COUNT(*) FROM fee_earnings WHERE id IN (
    '38b71d82-c283-4876-a0ae-51ec9b051fc3',
    'b7780242-288a-4c75-8c35-fa0cef704537',
    '6f4092fd-74a1-4ff6-ae77-0bd46f65f0c4'
  ) AND status = 'failed' AND failed_reason LIKE 'abandoned:%') AS now_marked_failed;

COMMIT;
