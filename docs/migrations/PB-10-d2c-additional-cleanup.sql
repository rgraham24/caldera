-- =============================================================
-- PB-10 — D-2c: cancel additional deprecated markets missed in D-2b.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- D-2b cancelled the obvious crypto fabrications (caldera-eth, eth, bitcoin)
-- but missed several other patterns:
--
--   1. Crypto markets via additional category-style creators:
--      - solana (4 markets)
--      - dogecoin (4)
--      - chainlink (4)
--      Same pattern as D-2b's bitcoin/eth fabrications.
--
--   2. Title-extraction artifact creators (token_status='archived',
--      no DeSo public key) — dummy rows from old generators that
--      fell back to the first word of the title:
--      april, brittany, doge, nft, nightreign, prime, adept, alnassr,
--      beast, bill, documentary, espresso, feastables, fromsoftware,
--      golf, implicated, loganpaulnft, michael, milestone, most, myna,
--      scott, short, there, utopia, yenft
--
--   3. Category-style creator with claim_status='claimed' but no DeSo
--      key (still a dummy row): tech
--
-- Markets pinned to LEGITIMATE DeSo creators (Drake, Logan Paul, Kai
-- Cenat, etc.) — even with creator_id=NULL — are LEFT ALONE. The
-- trade route handles slug-only routing correctly for these.
--
-- Pre-mutation snapshot:
--   markets_archive_d2c_2026_05 (48 rows at execution time; was 51 in
--   the original diagnostic but 3 self-resolved before we ran the UPDATE)
--
-- Verified at execution time:
--   archived_count: 48
--   remaining_in_scope_open: 0
--   total_open_after: 1,074
--   crypto_open_after: 0
--
-- ROLLBACK: see PB-10-d2c-additional-cleanup.rollback.sql
-- =============================================================

BEGIN;

CREATE TABLE markets_archive_d2c_2026_05 AS
  SELECT * FROM markets m
  WHERE m.creator_id IS NULL
    AND m.status = 'open'
    AND m.creator_slug IN (
      'solana', 'dogecoin', 'chainlink',
      'april', 'tech', 'brittany', 'doge', 'nft', 'nightreign', 'prime',
      'adept', 'alnassr', 'beast', 'bill', 'documentary', 'espresso',
      'feastables', 'fromsoftware', 'golf', 'implicated', 'loganpaulnft',
      'michael', 'milestone', 'most', 'myna', 'scott', 'short', 'there',
      'utopia', 'yenft'
    );

UPDATE markets
   SET status = 'cancelled',
       resolution_note = 'Cancelled in v2 cleanup (D-2c): market routed to a category-style or title-extraction placeholder creator (e.g. solana, dogecoin, chainlink for crypto markets; april, tech, nft, prime for theme dummies). Missed in D-2b''s scope.'
 WHERE creator_id IS NULL
   AND status = 'open'
   AND creator_slug IN (
      'solana', 'dogecoin', 'chainlink',
      'april', 'tech', 'brittany', 'doge', 'nft', 'nightreign', 'prime',
      'adept', 'alnassr', 'beast', 'bill', 'documentary', 'espresso',
      'feastables', 'fromsoftware', 'golf', 'implicated', 'loganpaulnft',
      'michael', 'milestone', 'most', 'myna', 'scott', 'short', 'there',
      'utopia', 'yenft'
   );

SELECT
  (SELECT COUNT(*) FROM markets_archive_d2c_2026_05) AS archived_count,
  (SELECT COUNT(*) FROM markets WHERE creator_id IS NULL AND status='open' AND creator_slug IN (
     'solana','dogecoin','chainlink','april','tech','brittany','doge','nft','nightreign','prime',
     'adept','alnassr','beast','bill','documentary','espresso','feastables','fromsoftware','golf',
     'implicated','loganpaulnft','michael','milestone','most','myna','scott','short','there','utopia','yenft'
  )) AS remaining_in_scope_open,
  (SELECT COUNT(*) FROM markets WHERE status='open') AS total_open_after,
  (SELECT COUNT(*) FROM markets WHERE status='open' AND creator_slug IN ('solana','dogecoin','chainlink')) AS crypto_open_after;

COMMIT;
