-- =============================================================
-- PB-7 — D-2b data cleanup: cancel deprecated markets + fix creator name bugs.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Phase D-2b ran this in production on 2026-05-02. It cleans up
-- pre-v2 cruft that the trade route would now hard-fail on:
--
--   1. ~1,044 pure-category markets (creator_id IS NULL AND creator_slug IS NULL)
--      — created by the daily generate-markets cron (deleted in D-2a) before
--        the v2 creator-required rule. Cancelled.
--
--   2. 16 crypto-fabrication markets routed to category-style "creators":
--      caldera-eth (5), eth (3), bitcoin (8). All deprecated under v2's
--      "creator-only, no crypto markets" rule. Cancelled.
--
--   3. 139 sloppy-data markets where creator_id was set but creator_slug
--      was NULL (slug-strip bug in lib/admin/pipeline.ts). Backfilled
--      from the linked creators row.
--
--   4. 5 creators where name was set to 'Caldera' by an importer
--      default-fallback bug. Names corrected to deso_username
--      (or slug if username was null).
--
-- Pre-mutation snapshots:
--   markets_archive_d2b_2026_05  (1,199 rows)
--   creators_archive_d2b_2026_05 (5 rows)
--
-- Verified counts at execution time:
--   archived_markets: 1199, archived_creators: 5
--   remaining_pure_category_open: 0
--   remaining_crypto_open: 0
--   remaining_sloppy_data: 0
--   remaining_caldera_name_bugs: 0
--
-- ROLLBACK: see PB-7-d2b-data-cleanup.rollback.sql
-- =============================================================

BEGIN;

-- ─── Step 0: Archive snapshots before any mutation ──────────
-- We capture the rows we're about to touch so they're recoverable.

CREATE TABLE markets_archive_d2b_2026_05 AS
  SELECT * FROM markets
  WHERE
    -- Bucket A: pure-category dead-ends
    (creator_id IS NULL AND creator_slug IS NULL AND status = 'open')
    -- Crypto fabrications: caldera-eth, eth, bitcoin
    OR (creator_slug IN ('caldera-eth', 'eth', 'bitcoin') AND status = 'open')
    -- Bucket B: sloppy-data (will be backfilled, archive pre-state)
    OR (creator_id IS NOT NULL AND creator_slug IS NULL);

CREATE TABLE creators_archive_d2b_2026_05 AS
  SELECT * FROM creators
  WHERE name = 'Caldera';

-- ─── Step 1: Cancel A_pure_category (1,044 expected) ────────

UPDATE markets
   SET status = 'cancelled',
       resolution_note = 'Cancelled in v2 cleanup: market had no creator attached (pure-category, deprecated under v2 tokenomics 2026-05-01).'
 WHERE creator_id IS NULL
   AND creator_slug IS NULL
   AND status = 'open';

-- ─── Step 2: Cancel crypto fabrications (16 expected: 5 + 3 + 8) ─

UPDATE markets
   SET status = 'cancelled',
       resolution_note = 'Cancelled in v2 cleanup: crypto price-prediction market routed to a deprecated category-style creator (caldera-eth, eth, or bitcoin).'
 WHERE creator_slug IN ('caldera-eth', 'eth', 'bitcoin')
   AND status = 'open';

-- ─── Step 3: Backfill B_sloppy_data creator_slug (139 expected) ─

UPDATE markets m
   SET creator_slug = c.slug
  FROM creators c
 WHERE m.creator_id = c.id
   AND m.creator_id IS NOT NULL
   AND m.creator_slug IS NULL;

-- ─── Step 4: Fix importer-bug Caldera creator names (5 expected) ─
-- Sets name to deso_username for the 5 rows where name='Caldera' was
-- a default-fallback bug. Falls back to slug if deso_username is null
-- (defensive — shouldn't happen given the diagnostic showed all 5 have it).

UPDATE creators
   SET name = COALESCE(deso_username, slug)
 WHERE name = 'Caldera';

-- ─── Step 5: Verify before commit ───────────────────────────

SELECT
  (SELECT COUNT(*) FROM markets_archive_d2b_2026_05)                                                  AS archived_markets,
  (SELECT COUNT(*) FROM creators_archive_d2b_2026_05)                                                 AS archived_creators,
  (SELECT COUNT(*) FROM markets WHERE creator_id IS NULL AND creator_slug IS NULL AND status='open') AS remaining_pure_category_open,
  (SELECT COUNT(*) FROM markets WHERE creator_slug IN ('caldera-eth','eth','bitcoin') AND status='open') AS remaining_crypto_open,
  (SELECT COUNT(*) FROM markets WHERE creator_id IS NOT NULL AND creator_slug IS NULL)                AS remaining_sloppy_data,
  (SELECT COUNT(*) FROM creators WHERE name = 'Caldera')                                              AS remaining_caldera_name_bugs;

COMMIT;
