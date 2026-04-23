-- Rollback for 20260422_increment_unclaimed_escrow_fn.sql

DROP FUNCTION IF EXISTS increment_unclaimed_escrow(uuid, numeric);
