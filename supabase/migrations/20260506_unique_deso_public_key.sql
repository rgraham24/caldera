-- Phase 5a: Make duplicate creator rows impossible at the DB level.
-- Phase 4b's data cleanup eliminated all existing duplicates among
-- non-archived rows. This constraint prevents future duplicates.
--
-- Partial index on non-null + non-archived: shadow rows with no DeSo
-- profile (deso_public_key=null) and archived rows are exempt.
-- Postgres treats NULL != NULL anyway, but partial index makes intent
-- explicit.

CREATE UNIQUE INDEX IF NOT EXISTS creators_deso_public_key_unique
  ON creators(deso_public_key)
  WHERE deso_public_key IS NOT NULL
    AND token_status != 'archived';
