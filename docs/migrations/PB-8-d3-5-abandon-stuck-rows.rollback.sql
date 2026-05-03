-- =============================================================
-- PB-8 ROLLBACK — Restore the 3 stuck rows from archive.
--
-- DO NOT run unless you are intentionally reverting D-3 #5.
--
-- After running, the 3 fee_earnings rows return to their pre-D-3-#5
-- state: status=NULL, failed_reason=NULL, paid_at=NULL.
-- =============================================================

BEGIN;

UPDATE fee_earnings fe
   SET status = a.status,
       failed_reason = a.failed_reason,
       paid_at = a.paid_at
  FROM fee_earnings_archive_d3_5_abandoned_2026_05 a
 WHERE fe.id = a.id;

SELECT COUNT(*) AS restored_count
FROM fee_earnings
WHERE id IN (
  '38b71d82-c283-4876-a0ae-51ec9b051fc3',
  'b7780242-288a-4c75-8c35-fa0cef704537',
  '6f4092fd-74a1-4ff6-ae77-0bd46f65f0c4'
)
AND status IS NULL;

COMMIT;
