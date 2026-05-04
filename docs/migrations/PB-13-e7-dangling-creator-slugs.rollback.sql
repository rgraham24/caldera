-- Rollback for PB-13: restore the 20 cancelled markets to their pre-cancellation state.
--
-- Uses the snapshot table markets_archive_e7_2026_05 created during the migration.

UPDATE markets m
SET
  status = a.status,
  resolved_at = a.resolved_at,
  resolution_outcome = a.resolution_outcome,
  resolution_note = a.resolution_note
FROM markets_archive_e7_2026_05 a
WHERE m.id = a.id;

-- Verify rollback
SELECT COUNT(*) AS restored_to_open
FROM markets
WHERE id IN (SELECT id FROM markets_archive_e7_2026_05)
  AND status = 'open';

-- Expected: 20

-- Optionally drop the snapshot table after verifying:
-- DROP TABLE markets_archive_e7_2026_05;
