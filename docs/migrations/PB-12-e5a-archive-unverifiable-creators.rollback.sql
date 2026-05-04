-- Rollback for PB-12: restore the 19 markets to open and the 9 creators to their original token_status.
--
-- Uses the snapshot tables created during the migration.

-- Restore market state from snapshot
UPDATE markets m
SET
  status = a.status,
  resolved_at = a.resolved_at,
  resolution_outcome = a.resolution_outcome,
  resolution_note = a.resolution_note
FROM markets_archive_e5a_2026_05 a
WHERE m.id = a.id;

-- Restore creator state from snapshot
UPDATE creators c
SET
  token_status = a.token_status
FROM creators_archive_e5a_2026_05 a
WHERE c.slug = a.slug;

-- Verify rollback
SELECT
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e5a_2026_05) AND status = 'open') AS markets_restored_to_open,
  (SELECT COUNT(*) FROM creators WHERE slug IN (SELECT slug FROM creators_archive_e5a_2026_05) AND token_status != 'archived') AS creators_restored;

-- Expected: 19 markets back to open, 9 creators back to non-archived

-- Optionally drop snapshot tables after verifying:
-- DROP TABLE markets_archive_e5a_2026_05;
-- DROP TABLE creators_archive_e5a_2026_05;
