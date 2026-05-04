-- Rollback for PB-14: restore the 13 markets to open and the kaicenat creator
-- back to its original (pending_deso_creation) status.
--
-- Uses the snapshot tables from the migration.

-- Restore market state from snapshot
UPDATE markets m
SET
  status = a.status,
  resolved_at = a.resolved_at,
  resolution_outcome = a.resolution_outcome,
  resolution_note = a.resolution_note
FROM markets_archive_e8_2026_05 a
WHERE m.id = a.id;

-- Restore creator state from snapshot
UPDATE creators c
SET token_status = a.token_status
FROM creators_archive_e8_2026_05 a
WHERE c.slug = a.slug;

-- Verify rollback
SELECT
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e8_2026_05) AND status = 'open') AS markets_restored_to_open,
  (SELECT COUNT(*) FROM creators WHERE slug = 'kaicenat' AND token_status != 'archived') AS creator_restored;

-- Expected: 13 markets back to open, 1 creator back to non-archived

-- Optionally drop snapshot tables after verifying:
-- DROP TABLE markets_archive_e8_2026_05;
-- DROP TABLE creators_archive_e8_2026_05;
