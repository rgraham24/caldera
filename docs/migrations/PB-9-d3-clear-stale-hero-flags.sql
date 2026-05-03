-- =============================================================
-- PB-9 — D-3: clear stale is_hero=true flags on non-open markets.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Phase D-3 ran this in production on 2026-05-02. After D-2b cancelled
-- ~1,060 markets, 2 of them retained is_hero=true (1 cancelled, 1
-- resolved). Their last is_hero assignment was made before D-2b ran,
-- and the curate-markets cron's reassignment query only touches
-- status='open' rows on update — so stale flags on now-non-open rows
-- weren't getting cleared.
--
-- The fix is to clear stale flags directly. The companion code fix
-- adds .eq('status','open') defensively on the rendering side
-- (app/(main)/page.tsx and any related routes) so even if a stale
-- flag re-appears, it can't render to a user.
--
-- Verified at execution time:
--   archived: 2
--   still_stale: 0
--   healthy_hero_count: 6
--
-- ROLLBACK: see PB-9-d3-clear-stale-hero-flags.rollback.sql
-- =============================================================

BEGIN;

CREATE TABLE markets_archive_d3_hero_flag_2026_05 AS
  SELECT id, slug, title, status, is_hero, updated_at
  FROM markets
  WHERE is_hero = true AND status != 'open';

UPDATE markets
   SET is_hero = false
 WHERE is_hero = true
   AND status != 'open';

SELECT
  (SELECT COUNT(*) FROM markets_archive_d3_hero_flag_2026_05) AS archived,
  (SELECT COUNT(*) FROM markets WHERE is_hero = true AND status != 'open') AS still_stale,
  (SELECT COUNT(*) FROM markets WHERE is_hero = true AND status = 'open') AS healthy_hero_count;

COMMIT;
