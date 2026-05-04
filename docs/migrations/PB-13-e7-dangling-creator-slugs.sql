-- Phase E-7: Cancel 20 open markets with dangling creator_slug references.
--
-- All 20 markets had creator_slug values pointing to creators that don't
-- exist in Caldera's creators table. Three distinct slugs:
--   - curry (13 markets) — real reserved DeSo handle is stephencurry30
--   - justintimberlake (3 markets) — real reserved handle is jtimberlake
--   - leomessi (4 markets) — Messi has no personal DeSo profile; Adidas
--     runs verified handle teammessi
--
-- In all three cases, the slug the pipeline generated does not match the
-- actual verified DeSo handle. Per the verification rule: cancel rather
-- than try to fix. If/when the correct handles are imported, the picker
-- will surface them and fresh markets can be created against valid slugs.
--
-- Why now: Phase E-3 made it impossible to create new markets with
-- dangling slug references. E-7 cleans up the existing dangling state.
--
-- Snapshot: markets_archive_e7_2026_05 (20 rows captured before UPDATE).
-- Rollback: see PB-13-e7-dangling-creator-slugs.rollback.sql.

-- 1. Snapshot the targets before mutation.
CREATE TABLE markets_archive_e7_2026_05 AS
SELECT m.*
FROM markets m
LEFT JOIN creators c ON c.slug = m.creator_slug
WHERE m.status = 'open'
  AND m.creator_slug IS NOT NULL
  AND c.id IS NULL;

-- 2. Cancel the markets.
UPDATE markets
SET
  status = 'cancelled',
  resolved_at = NOW(),
  resolution_outcome = 'cancelled',
  resolution_note = 'Phase E-7: creator_slug references a non-existent creator (curry, justintimberlake, leomessi). Real verified DeSo handles for these people are stephencurry30, jtimberlake, and teammessi (Adidas-run) — different from the generated slugs. Pre-launch cleanup.'
WHERE id IN (SELECT id FROM markets_archive_e7_2026_05);

-- 3. Verify.
SELECT
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e7_2026_05) AND status = 'cancelled') AS markets_now_cancelled,
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e7_2026_05) AND status = 'open') AS markets_still_open;

-- Expected: 20 / 0
-- Actual on 2026-05-04: 20 / 0 ✅
