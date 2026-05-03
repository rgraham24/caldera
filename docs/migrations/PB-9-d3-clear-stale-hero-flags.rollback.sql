-- =============================================================
-- PB-9 ROLLBACK — Restore the 2 stale is_hero flags from archive.
-- DO NOT run unless you are intentionally reverting D-3.
-- =============================================================

BEGIN;

UPDATE markets m
   SET is_hero = a.is_hero
  FROM markets_archive_d3_hero_flag_2026_05 a
 WHERE m.id = a.id;

SELECT COUNT(*) AS restored
FROM markets m
JOIN markets_archive_d3_hero_flag_2026_05 a ON a.id = m.id
WHERE m.is_hero = true;

COMMIT;
