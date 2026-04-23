-- Migration: Atomic function to increment a creator's unclaimed earnings escrow
-- Date: 2026-04-22
-- Reason: Step 3b of tokenomics-v2. Replaces the race-prone
-- "read current, add slice, write back" pattern with an atomic SQL
-- increment. Also sets unclaimed_escrow_first_accrued_at on first accrual
-- only (COALESCE no-ops if already set).
--
-- Usage from Supabase client:
--   const { error } = await supabase.rpc('increment_unclaimed_escrow', {
--     p_creator_id: '<uuid>',
--     p_amount: 0.005,
--   });

CREATE OR REPLACE FUNCTION increment_unclaimed_escrow(
  p_creator_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- runs with the function owner's privileges; required so
                 -- this can be called from the service_role key only.
                 -- Safe because the function is constrained to this one op.
AS $$
BEGIN
  -- Defensive: never accept a non-positive amount.
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'increment_unclaimed_escrow: amount must be > 0 (got %)', p_amount;
  END IF;

  UPDATE creators
  SET
    unclaimed_earnings_escrow = COALESCE(unclaimed_earnings_escrow, 0) + p_amount,
    unclaimed_escrow_first_accrued_at = COALESCE(unclaimed_escrow_first_accrued_at, now())
  WHERE id = p_creator_id;

  -- If no row was updated, raise so the caller notices.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'increment_unclaimed_escrow: no creator with id %', p_creator_id;
  END IF;
END;
$$;

-- Only callable by the service_role (server-side code). Clients cannot
-- reach this function directly — matches the write-from-server-only rule
-- we use for holder_rewards.
REVOKE ALL ON FUNCTION increment_unclaimed_escrow(uuid, numeric) FROM public;
REVOKE ALL ON FUNCTION increment_unclaimed_escrow(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION increment_unclaimed_escrow(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_unclaimed_escrow(uuid, numeric) TO service_role;

COMMENT ON FUNCTION increment_unclaimed_escrow(uuid, numeric) IS
  'Atomically adds p_amount to creators.unclaimed_earnings_escrow and sets
  unclaimed_escrow_first_accrued_at on first accrual. Called by the trade
  route for the 0.5% creator slice on unclaimed-creator markets.
  See DECISIONS.md 2026-04-21 for tokenomics rationale.';
