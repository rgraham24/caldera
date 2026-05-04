-- Phase E-5a: Archive 9 unverifiable creators + cancel their 19 open markets.
--
-- All 9 creators fall into one of two unverifiable categories:
--   1. Theme/event "creators" (6) — not real people, violate v2 creator rule
--   2. Real people whose DeSo handles are squatters or unverifiable (3)
--
-- Per Caldera verification rule: a creator can only have markets if their
-- DeSo profile is verifiably theirs (BitClout-original reserved profile OR
-- Caldera-manually-verified). Squatters using celebrity usernames do not
-- count. When in doubt: cancel markets and archive creators.
--
-- Why now: Phase E-3 made it impossible to create new broken markets.
-- E-4 cleaned the obviously-broken 46. E-5a cleans the remaining 9
-- creators with broken state.
--
-- Snapshots: markets_archive_e5a_2026_05 (19) + creators_archive_e5a_2026_05 (9).
-- Rollback: see PB-12-e5a-archive-unverifiable-creators.rollback.sql.

-- 1. Snapshot markets and creators before mutation.
CREATE TABLE markets_archive_e5a_2026_05 AS
SELECT m.*
FROM markets m
WHERE m.status = 'open'
  AND m.creator_slug IN (
    'conflict-markets',
    'elden-ring-nightreign-drama',
    'livestreamfail-mod-scandal',
    'trump-iran-ceasefire',
    'kick-vs-twitch',
    'steelovsky-vs-notalbino',
    'icespicee',
    'icespice',
    'theomniliberal'
  );

CREATE TABLE creators_archive_e5a_2026_05 AS
SELECT c.*
FROM creators c
WHERE c.slug IN (
  'conflict-markets',
  'elden-ring-nightreign-drama',
  'livestreamfail-mod-scandal',
  'trump-iran-ceasefire',
  'kick-vs-twitch',
  'steelovsky-vs-notalbino',
  'icespicee',
  'icespice',
  'theomniliberal'
);

-- 2. Cancel markets.
UPDATE markets
SET
  status = 'cancelled',
  resolved_at = NOW(),
  resolution_outcome = 'cancelled',
  resolution_note = 'Phase E-5a: creator could not be verified per Caldera verification rule (not a reserved BitClout profile, not manually verified, or theme/event placeholder). Pre-launch cleanup.'
WHERE id IN (SELECT id FROM markets_archive_e5a_2026_05);

-- 3. Archive creators.
UPDATE creators
SET
  token_status = 'archived'
WHERE slug IN (SELECT slug FROM creators_archive_e5a_2026_05);

-- 4. Verify.
SELECT
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e5a_2026_05) AND status = 'cancelled') AS markets_now_cancelled,
  (SELECT COUNT(*) FROM markets WHERE id IN (SELECT id FROM markets_archive_e5a_2026_05) AND status = 'open') AS markets_still_open,
  (SELECT COUNT(*) FROM creators WHERE slug IN (SELECT slug FROM creators_archive_e5a_2026_05) AND token_status = 'archived') AS creators_now_archived,
  (SELECT COUNT(*) FROM creators WHERE slug IN (SELECT slug FROM creators_archive_e5a_2026_05) AND token_status != 'archived') AS creators_not_archived;

-- Expected: 19 / 0 / 9 / 0
-- Actual on 2026-05-04: 19 / 0 / 9 / 0 ✅
