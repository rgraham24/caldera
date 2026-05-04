-- Rollback for PB-11: restore the 46 cancelled markets to their pre-cancellation state.
--
-- Uses the snapshot table markets_archive_e4_2026_05 created during the migration.

-- Restore status, resolved_at, and resolution_outcome from the snapshot.
UPDATE markets m
SET
  status = a.status,
  resolved_at = a.resolved_at,
  resolution_outcome = a.resolution_outcome
FROM markets_archive_e4_2026_05 a
WHERE m.id = a.id;

-- Verify rollback
SELECT
  COUNT(*) AS restored_to_open
FROM markets
WHERE id IN (SELECT id FROM markets_archive_e4_2026_05)
  AND status = 'open';

-- Expected: 46 (all snapshotted markets back to their original 'open' state)

-- Optionally drop the snapshot table after verifying rollback success:
-- DROP TABLE markets_archive_e4_2026_05;
