-- =============================================================
-- PB-10 ROLLBACK — Restore D-2c cancellations from archive.
-- DO NOT run unless you are intentionally reverting D-2c.
-- =============================================================

BEGIN;

UPDATE markets m
   SET status = a.status,
       resolution_note = a.resolution_note
  FROM markets_archive_d2c_2026_05 a
 WHERE m.id = a.id;

SELECT COUNT(*) AS restored_count
FROM markets m
JOIN markets_archive_d2c_2026_05 a ON a.id = m.id
WHERE m.status = 'open';

COMMIT;
