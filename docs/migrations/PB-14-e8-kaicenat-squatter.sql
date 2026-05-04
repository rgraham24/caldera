-- Phase E-8: Cancel 13 kaicenat markets + archive the kaicenat creator row.
--
-- The kaicenat handle on DeSo is a confirmed squatter, not the real
-- Kai Cenat. Verified by Robert at bitclout.com/u/kaicenat — Kai Cenat
-- does not have a verified DeSo profile and someone squatted his name.
-- Per locked verification rule (memory #15): archive.
--
-- This was the entire 'other_status' bucket from the morning audit
-- (2026-05-04). All 13 markets pointed to the single kaicenat creator
-- with token_status='pending_deso_creation' — Caldera had attempted
-- Path B placeholder creation but the underlying DeSo handle is a
-- squatter, not the real person.
--
-- Why now: companion to E-7 (dangling slugs). E-8 closes the last
-- bucket of broken markets identified in this morning's diagnostic.
--
-- Snapshots:
--   - markets_archive_e8_2026_05 (13 rows)
--   - creators_archive_e8_2026_05 (1 row)
-- Rollback: see PB-14-e8-kaicenat-squatter.rollback.sql.

-- 1. Snapshot.
CREATE TABLE markets_archive_e8_2026_05 AS
SELECT m.*
FROM markets m
WHERE m.status = 'open'
  AND m.creator_slug = 'kaicenat';

CREATE TABLE creators_archive_e8_2026_05 AS
SELECT c.*
FROM creators c
WHERE c.slug = 'kaicenat';

-- 2. Cancel markets.
UPDATE markets
SET
  status = 'cancelled',
  resolved_at = NOW(),
  resolution_outcome = 'cancelled',
  resolution_note = 'Phase E-8: kaicenat handle on DeSo is a squatter, not the real Kai Cenat (verified on bitclout.com/u/kaicenat). Per Caldera verification rule. Pre-launch cleanup.'
WHERE id IN (SELECT id FROM markets_archive_e8_2026_05);

-- 3. Archive creator.
UPDATE creators
SET token_status = 'archived'
WHERE slug = 'kaicenat';

-- 4. Verify.
SELECT
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e8_2026_05) AND status = 'cancelled') AS markets_now_cancelled,
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e8_2026_05) AND status = 'open') AS markets_still_open,
  (SELECT COUNT(*) FROM creators WHERE slug = 'kaicenat' AND token_status = 'archived') AS creator_now_archived;

-- Expected: 13 / 0 / 1
-- Actual on 2026-05-04: 13 / 0 / 1 ✅
