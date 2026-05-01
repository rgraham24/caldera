-- =============================================================
-- PB-1 — atomic_record_trade_v2 RPC for buy route atomicity (v2 tokenomics).
--
-- Run via Supabase SQL editor:
--   https://supabase.com/dashboard/project/ekorhgypjdbiyhpbfzqv/sql/new
--
-- Wraps all synchronous DB writes from the buy route in a single
-- transaction. Either all succeed and the ledger is internally
-- consistent, or none happen and the route returns an error.
--
-- Differences from atomic_record_trade (P3-1.2):
--   1. Expects exactly 2 fee_earnings rows in p_fees (platform +
--      creator_auto_buy), down from 4 rows in v1.
--   2. NO escrow increment. The 1% creator-coin auto-buy IS the
--      compensation model under v2 tokenomics — claimed creators
--      receive coins directly, unclaimed creators have coins held
--      in the platform wallet (claim bounty). The
--      creators.unclaimed_earnings_escrow column is left untouched
--      so legacy DESO accruals remain claimable; new trades simply
--      do not contribute to it.
--
-- ROLLBACK: this is an additive migration. To roll back, run:
--   DROP FUNCTION IF EXISTS atomic_record_trade_v2(JSONB, JSONB, JSONB, JSONB[]);
-- The original atomic_record_trade function is left in place and
-- continues to be callable until B.2 cuts over the trades route.
--
-- IMPORTANT: This is a NEW function alongside atomic_record_trade.
-- The v1 function is NOT replaced or dropped by this migration.
-- =============================================================

CREATE OR REPLACE FUNCTION atomic_record_trade_v2(
  p_trade           JSONB,
  p_market          JSONB,
  p_position_delta  JSONB,
  p_fees            JSONB[]
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
    total_volume     = COALESCE(total_volume, 0) + (p_market->>'volume_delta')::NUMERIC,
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
  --
  -- Under v2 tokenomics, p_fees is expected to contain exactly 2
  -- entries: one with recipient_type='platform' and one with
  -- recipient_type='creator_auto_buy'. The CHECK constraint on
  -- fee_earnings.recipient_type (set by PB-2) enforces this — any
  -- other value will RAISE and roll back the whole transaction.

  IF p_fees IS NOT NULL AND array_length(p_fees, 1) > 0 THEN
    FOREACH v_fee IN ARRAY p_fees LOOP
      INSERT INTO fee_earnings
        SELECT * FROM jsonb_populate_record(NULL::fee_earnings, v_fee);
    END LOOP;
  END IF;

  -- ─── Step 5: (intentionally removed) ───────────────────────
  -- v1 had a Step 5 that incremented creators.unclaimed_earnings_escrow
  -- when the creator was unclaimed. Under v2 tokenomics, the 1%
  -- creator-coin auto-buy replaces escrow entirely as the
  -- unclaimed-creator compensation model. The escrow column itself
  -- is preserved (legacy DESO accruals remain claimable) but is no
  -- longer incremented on new trades.

  RETURN v_trade_id;
END;
$$;

COMMENT ON FUNCTION atomic_record_trade_v2 IS
  'PB-1 — Atomic ledger recording for buy trades under v2 tokenomics. Wraps trade INSERT, market UPDATE, position upsert, and fee_earnings INSERT × 2 in a single transaction. Returns trade.id on success. Errors raised inside roll back all changes. Fire-and-forget operations (creator-coin auto-buy on DeSo, etc.) happen in the route AFTER this RPC succeeds. No escrow increment — see DECISIONS.md 2026-05-01.';

-- ─── Verification queries (run after the above) ──────────────
--
-- 1. Function exists with correct signature:
--    SELECT proname, pronargs, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'atomic_record_trade_v2';
--    → expect: pronargs=4, all required (no DEFAULTs)
--
-- 2. SECURITY DEFINER set:
--    SELECT proname, prosecdef FROM pg_proc
--    WHERE proname = 'atomic_record_trade_v2';
--    → expect: prosecdef=true
--
-- 3. v1 function still present (we did not drop it):
--    SELECT proname FROM pg_proc WHERE proname = 'atomic_record_trade';
--    → expect: 1 row
