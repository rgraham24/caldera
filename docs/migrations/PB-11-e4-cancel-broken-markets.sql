-- Phase E-4: Cancel 46 broken open markets.
--
-- Targets:
--   - status='open' markets with creator_slug IS NULL (5 rows)
--   - status='open' markets pinned to creators with token_status='archived' (41 rows)
--
-- Why now: Phase E-3 (merged 2026-05-04, commit f34800f) made it impossible
-- to CREATE new markets with broken creator references. This migration cleans
-- up the existing broken state. Per memory: Caldera is pre-launch, so volume
-- on these markets was test/dummy data — no users to refund.
--
-- Snapshot: markets_archive_e4_2026_05 (46 rows captured before UPDATE).
-- Rollback: see PB-11-e4-cancel-broken-markets.rollback.sql.

-- 1. Snapshot the targets before mutation.
CREATE TABLE markets_archive_e4_2026_05 AS
SELECT m.*
FROM markets m
LEFT JOIN creators c ON c.slug = m.creator_slug
WHERE m.status = 'open'
  AND (
    m.creator_slug IS NULL
    OR c.token_status = 'archived'
  );

-- 2. Cancel the markets.
UPDATE markets m
SET
  status = 'cancelled',
  resolved_at = NOW(),
  resolution_outcome = 'cancelled'
FROM creators c
WHERE m.status = 'open'
  AND (
    m.creator_slug IS NULL
    OR (m.creator_slug = c.slug AND c.token_status = 'archived')
  );

-- 3. Verify.
SELECT
  COUNT(*) FILTER (WHERE status = 'cancelled') AS now_cancelled,
  COUNT(*) FILTER (WHERE status = 'open' AND creator_slug IS NULL) AS still_null_open,
  COUNT(*) FILTER (
    WHERE status = 'open'
    AND creator_slug IN (SELECT slug FROM creators WHERE token_status = 'archived')
  ) AS still_archived_open
FROM markets
WHERE id IN (SELECT id FROM markets_archive_e4_2026_05);

-- Expected: 46 / 0 / 0
-- Actual on 2026-05-04: 46 / 0 / 0 ✅
