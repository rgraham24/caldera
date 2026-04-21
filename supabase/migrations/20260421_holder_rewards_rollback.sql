-- Rollback for 20260421_holder_rewards.sql
-- DO NOT run unless intentionally reverting the migration.
-- WARNING: Dropping holder_rewards will destroy all accrued reward data.

DROP TABLE IF EXISTS holder_rewards CASCADE;

ALTER TABLE creators
  DROP COLUMN IF EXISTS unclaimed_escrow_first_accrued_at,
  DROP COLUMN IF EXISTS unclaimed_escrow_rolled_over_at,
  DROP COLUMN IF EXISTS unclaimed_escrow_rolled_over_total;
