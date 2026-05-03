-- =============================================================
-- PB-7 ROLLBACK — Restore D-2b cleanup from archive snapshots.
--
-- DO NOT run unless you are intentionally reverting D-2b.
--
-- Restores from:
--   markets_archive_d2b_2026_05
--   creators_archive_d2b_2026_05
--
-- After running, the markets and creators tables will match their
-- pre-2026-05-02 state for the rows that D-2b touched. Rows inserted
-- after D-2b are untouched.
-- =============================================================

BEGIN;

-- Restore market rows from archive (status, creator_slug, resolution_note)
UPDATE markets m
   SET status          = a.status,
       creator_slug    = a.creator_slug,
       resolution_note = a.resolution_note
  FROM markets_archive_d2b_2026_05 a
 WHERE m.id = a.id;

-- Restore creator names from archive
UPDATE creators c
   SET name = a.name
  FROM creators_archive_d2b_2026_05 a
 WHERE c.id = a.id;

-- Verify before commit
SELECT
  (SELECT COUNT(*) FROM markets WHERE creator_id IS NULL AND creator_slug IS NULL AND status='open') AS pure_category_restored,
  (SELECT COUNT(*) FROM markets WHERE creator_slug IN ('caldera-eth','eth','bitcoin') AND status='open') AS crypto_restored,
  (SELECT COUNT(*) FROM markets WHERE creator_id IS NOT NULL AND creator_slug IS NULL) AS sloppy_data_restored,
  (SELECT COUNT(*) FROM creators WHERE name = 'Caldera') AS caldera_names_restored;

COMMIT;
