-- =============================================================
-- P3-5.4b — Extend mark_creator_claim_complete RPC for combined
-- profile-claim + earnings flow.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- The v1 RPC (P3-5.2) handled earnings-only transitions. v2 of
-- the design also handles the profile-claim transition for
-- first-time claimants atomically — a single transaction wraps
-- both the profile flip and the escrow zero/earnings bump.
--
-- IMPORTANT: CREATE OR REPLACE in PostgreSQL matches functions by
-- their exact argument list. Adding parameters creates a NEW
-- overload — both versions would coexist. We must DROP the v1
-- signature explicitly before CREATE OR REPLACE so only v2
-- remains.
--
-- The v2 signature has DEFAULT values for the new args, so any
-- callers passing the original 4 args still work.
-- =============================================================

-- ─── Step 1: Drop the v1 4-arg signature ──────────────────────
-- IF EXISTS makes this idempotent (safe on fresh databases).

DROP FUNCTION IF EXISTS mark_creator_claim_complete(
  UUID, UUID, NUMERIC, TEXT
);

-- ─── Step 2: Create the v2 6-arg version ─────────────────────

CREATE OR REPLACE FUNCTION mark_creator_claim_complete(
  p_audit_id            UUID,
  p_creator_id          UUID,
  p_escrow_usd          NUMERIC,
  p_tx_hash             TEXT,
  p_also_claim_profile  BOOLEAN DEFAULT FALSE,
  p_recipient_pubkey    TEXT    DEFAULT NULL
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- Branch on whether this is a first-time claim with money
  -- or a repeat earnings withdrawal.

  IF p_also_claim_profile THEN
    -- First-time claim: also flip profile state.
    -- Recipient pubkey is required because we set deso_public_key.
    IF p_recipient_pubkey IS NULL THEN
      RAISE EXCEPTION 'recipient-pubkey-required-for-profile-claim';
    END IF;

    UPDATE creators
      SET unclaimed_earnings_escrow = 0,
          total_creator_earnings    = COALESCE(total_creator_earnings, 0) + p_escrow_usd,
          tier                      = 'verified_creator',
          claim_status              = 'claimed',
          deso_public_key           = p_recipient_pubkey,
          claimed_at                = COALESCE(claimed_at, NOW())
      WHERE id   = p_creator_id
        AND tier = 'unclaimed';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'creator-not-found-or-not-unclaimed: %', p_creator_id;
    END IF;
  ELSE
    -- Repeat: already-claimed creator just collecting earnings.
    UPDATE creators
      SET unclaimed_earnings_escrow = 0,
          total_creator_earnings    = COALESCE(total_creator_earnings, 0) + p_escrow_usd,
          claimed_at                = COALESCE(claimed_at, NOW())
      WHERE id           = p_creator_id
        AND claim_status = 'claimed';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'creator-not-found-or-not-claimed: %', p_creator_id;
    END IF;
  END IF;

  -- Mark the audit row claimed (same for both branches)
  UPDATE creator_claim_payouts
    SET status        = 'claimed',
        tx_hash       = p_tx_hash,
        completed_at  = NOW()
    WHERE id     = p_audit_id
      AND status = 'in_flight';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit-row-not-in-flight: %', p_audit_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION mark_creator_claim_complete IS
  'P3-5.4b — Atomic ledger transition for creator claim. Branches on p_also_claim_profile: first-time claim (TRUE) also flips tier/claim_status/deso_public_key; repeat earnings withdrawal (FALSE, default) just zeroes escrow. Either way, audit row marked claimed with tx_hash. Roll-back-on-error guarantees no partial state.';

-- ─── Verification queries ───────────────────────────────────
--
-- 1. Only the 6-arg version exists (v1 successfully dropped):
--    SELECT proname, pronargs, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'mark_creator_claim_complete';
--    → expect: 1 row, pronargs=6, args list shows DEFAULTs
--
-- 2. Backwards-compat smoke test (4-arg call still works via
--    DEFAULTs):
--    The route would call with 6 args; legacy callers (none yet)
--    would call with 4 args and v2's DEFAULTs fill in the rest.
