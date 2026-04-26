-- =============================================================
-- P3-1.2 — atomic_record_trade RPC for buy route atomicity.
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Wraps all synchronous DB writes from the buy route in a single
-- transaction. Either all succeed and the ledger is internally
-- consistent, or none happen and the route returns an error.
--
-- IMPORTANT: This is a NEW function, not a replace. No existing
-- function with this name exists (verified via pg_proc).
-- =============================================================

CREATE OR REPLACE FUNCTION atomic_record_trade(
  p_trade               JSONB,
  p_market              JSONB,
  p_position_delta      JSONB,
  p_fees                JSONB[],
  p_escrow_creator_id   UUID DEFAULT NULL,
  p_escrow_amount       NUMERIC DEFAULT NULL
) RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_trade_id UUID;
  v_fee JSONB;
BEGIN
  -- ─── Step 1: Insert trade ───────────────────────────────────
  -- jsonb_populate_record maps JSONB keys to columns by name.
  -- Route MUST use snake_case keys matching schema. Unknown keys
  -- are silently ignored. Don't include id/created_at — DB
  -- defaults handle them.
  --
  -- Unique violation on tx_hash (code 23505) propagates to caller
  -- which catches as 409 replay.

  INSERT INTO trades
    SELECT * FROM jsonb_populate_record(NULL::trades, p_trade)
  RETURNING id INTO v_trade_id;

  -- ─── Step 2: Update market ──────────────────────────────────
  -- AMM pool changes are pre-computed in the route from THIS
  -- trade's quote. Order-independent (no read-then-write race).

  UPDATE markets SET
    yes_pool         = (p_market->>'yes_pool')::NUMERIC,
    no_pool          = (p_market->>'no_pool')::NUMERIC,
    yes_price        = (p_market->>'yes_price')::NUMERIC,
    no_price         = (p_market->>'no_price')::NUMERIC,
    total_volume_usd = COALESCE(total_volume_usd, 0) + (p_market->>'volume_delta')::NUMERIC,
    updated_at       = NOW()
  WHERE id = (p_market->>'id')::UUID;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'market-not-found: %', p_market->>'id';
  END IF;

  -- ─── Step 3: Position upsert with deltas ───────────────────
  -- ON CONFLICT uses the existing positions_user_id_market_id_side_key
  -- UNIQUE constraint. Inside the RPC's transaction, the row is
  -- locked, so simultaneous trades on the same position are
  -- serialized by Postgres.
  --
  -- avg_entry_price recalculated as new total_cost / new quantity
  -- to maintain a meaningful weighted-average over multiple buys.

  INSERT INTO positions (
    user_id, market_id, side,
    quantity, total_cost, fees_paid,
    avg_entry_price, status,
    created_at, updated_at
  ) VALUES (
    (p_position_delta->>'user_id')::UUID,
    (p_position_delta->>'market_id')::UUID,
    p_position_delta->>'side',
    (p_position_delta->>'qty_delta')::NUMERIC,
    (p_position_delta->>'cost_delta')::NUMERIC,
    (p_position_delta->>'fees_delta')::NUMERIC,
    CASE
      WHEN (p_position_delta->>'qty_delta')::NUMERIC > 0
      THEN (p_position_delta->>'cost_delta')::NUMERIC / (p_position_delta->>'qty_delta')::NUMERIC
      ELSE 0
    END,
    'open',
    NOW(), NOW()
  )
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    quantity        = positions.quantity + EXCLUDED.quantity,
    total_cost      = positions.total_cost + EXCLUDED.total_cost,
    fees_paid       = positions.fees_paid + EXCLUDED.fees_paid,
    avg_entry_price = CASE
      WHEN (positions.quantity + EXCLUDED.quantity) > 0
      THEN (positions.total_cost + EXCLUDED.total_cost) / (positions.quantity + EXCLUDED.quantity)
      ELSE positions.avg_entry_price
    END,
    status          = 'open',
    updated_at      = NOW();

  -- ─── Step 4: Insert fee_earnings rows ──────────────────────
  -- Loop over JSONB array. Each element gets jsonb_populate_record
  -- applied. Skip silently if array is null or empty.

  IF p_fees IS NOT NULL AND array_length(p_fees, 1) > 0 THEN
    FOREACH v_fee IN ARRAY p_fees LOOP
      INSERT INTO fee_earnings
        SELECT * FROM jsonb_populate_record(NULL::fee_earnings, v_fee);
    END LOOP;
  END IF;

  -- ─── Step 5: Increment unclaimed escrow if applicable ──────
  -- Calls the existing increment_unclaimed_escrow function.
  -- Both functions execute in the same transaction; any RAISE
  -- inside the inner function rolls back our changes too.

  IF p_escrow_creator_id IS NOT NULL
     AND p_escrow_amount IS NOT NULL
     AND p_escrow_amount > 0 THEN
    PERFORM increment_unclaimed_escrow(p_escrow_creator_id, p_escrow_amount);
  END IF;

  RETURN v_trade_id;
END;
$$;

COMMENT ON FUNCTION atomic_record_trade IS
  'P3-1.2 — Atomic ledger recording for buy trades. Wraps trade INSERT, market UPDATE, position upsert, fee_earnings INSERT × N, and optional escrow increment in a single transaction. Returns trade.id on success. Errors raised inside roll back all changes. Fire-and-forget operations (buyback, snapshot, etc.) happen in the route AFTER this RPC succeeds.';

-- ─── Verification queries (run after the above) ──────────────
--
-- 1. Function exists with correct signature:
--    SELECT proname, pronargs, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'atomic_record_trade';
--    → expect: pronargs=6, args list shows DEFAULTs on last 2
--
-- 2. SECURITY DEFINER set:
--    SELECT proname, prosecdef FROM pg_proc
--    WHERE proname = 'atomic_record_trade';
--    → expect: prosecdef=true
--
-- 3. Test invocation with smallest viable input:
--    Build a synthetic invocation in TypeScript route tests
--    rather than testing in raw SQL (the route's tests will
--    exercise the function via supabase.rpc()).
