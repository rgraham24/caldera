-- P3-2.2 — Sell payout schema + mark_sell_complete RPC
-- Branch: feat/p3-2-sell-atomicity
--
-- Changes:
--   1. Add payout columns on trades (all nullable, back-compat with buy rows)
--   2. CHECK constraint on payout_status
--   3. ALTER trades.tx_hash DROP NOT NULL (sells have tx_hash=NULL; buys still set it;
--      plain UNIQUE already treats NULLs as distinct so replay protection intact)
--   4. Partial UNIQUE index: one pending sell per (user, market, side) at a time
--   5. mark_sell_complete RPC: atomically marks trade paid + closes/reduces position
--      + updates AMM pools/prices/volume + inserts market_price_history snapshot

-- ─── 1. Payout columns ─────────────────────────────────────────────────────

ALTER TABLE trades
  ADD COLUMN payout_status       TEXT,
  ADD COLUMN payout_tx_hash      TEXT,
  ADD COLUMN payout_at           TIMESTAMPTZ,
  ADD COLUMN payout_failed_reason TEXT;

-- ─── 2. CHECK constraint ───────────────────────────────────────────────────

ALTER TABLE trades
  ADD CONSTRAINT trades_payout_status_check
  CHECK (payout_status IS NULL OR payout_status IN ('pending', 'paid', 'failed'));

-- ─── 3. Make tx_hash nullable ──────────────────────────────────────────────
-- Safe: UNIQUE (tx_hash) is a plain unique constraint; PostgreSQL treats NULLs as
-- distinct, so multiple NULL rows are permitted. Buy rows still supply a non-null
-- tx_hash and continue to get replay protection. Sell rows use payout_tx_hash instead.

ALTER TABLE trades ALTER COLUMN tx_hash DROP NOT NULL;

-- ─── 4. Partial UNIQUE index ───────────────────────────────────────────────
-- Prevents two concurrent in-flight sells for the same (user, market, side).
-- Only applies while payout_status='pending'; once failed, user may retry with
-- a new idempotency key.

CREATE UNIQUE INDEX uq_pending_sell
  ON trades (user_id, market_id, side)
  WHERE payout_status = 'pending';

-- ─── 5. mark_sell_complete RPC ─────────────────────────────────────────────
-- Called by the sell route after transferDeso succeeds. Atomically:
--   a) marks trade paid (UPDATE trades WHERE payout_status='pending')
--   b) closes or reduces the position
--   c) updates market AMM (pools, prices, volume)
--   d) inserts a market_price_history snapshot
--
-- RAISE EXCEPTION on any state mismatch rolls back all changes.
-- SECURITY DEFINER matches house style (P3-1, P3-4, P3-5).
--
-- Args:
--   p_trade_id       — trade row id (was inserted with payout_status='pending')
--   p_payout_tx_hash — DeSo tx hash from transferDeso
--   p_position_delta — JSONB: { id, qty_to_remove, realized_pnl_delta,
--                               total_cost_delta, close }
--   p_market_update  — JSONB: { id, yes_pool, no_pool, yes_price, no_price,
--                               volume_delta, history_yes_price, history_no_price }

CREATE OR REPLACE FUNCTION mark_sell_complete(
  p_trade_id        UUID,
  p_payout_tx_hash  TEXT,
  p_position_delta  JSONB,
  p_market_update   JSONB
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- a) Mark trade paid
  UPDATE trades
  SET payout_status  = 'paid',
      payout_tx_hash = p_payout_tx_hash,
      payout_at      = NOW()
  WHERE id = p_trade_id
    AND payout_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade-not-pending: %', p_trade_id;
  END IF;

  -- b) Update position: close or reduce
  IF (p_position_delta->>'close')::BOOLEAN THEN
    -- Full close: zero out quantity, set status='closed'
    UPDATE positions
    SET quantity     = 0,
        status       = 'closed',
        total_cost   = GREATEST(COALESCE(total_cost, 0) - (p_position_delta->>'total_cost_delta')::NUMERIC, 0),
        realized_pnl = COALESCE(realized_pnl, 0) + (p_position_delta->>'realized_pnl_delta')::NUMERIC,
        updated_at   = NOW()
    WHERE id = (p_position_delta->>'id')::UUID;
  ELSE
    -- Partial sell: reduce quantity, recalculate avg_entry_price
    UPDATE positions
    SET quantity     = quantity - (p_position_delta->>'qty_to_remove')::NUMERIC,
        total_cost   = GREATEST(COALESCE(total_cost, 0) - (p_position_delta->>'total_cost_delta')::NUMERIC, 0),
        realized_pnl = COALESCE(realized_pnl, 0) + (p_position_delta->>'realized_pnl_delta')::NUMERIC,
        avg_entry_price = CASE
          WHEN quantity - (p_position_delta->>'qty_to_remove')::NUMERIC > 0
          THEN (COALESCE(total_cost, 0) - (p_position_delta->>'total_cost_delta')::NUMERIC)
               / (quantity - (p_position_delta->>'qty_to_remove')::NUMERIC)
          ELSE avg_entry_price
        END,
        updated_at   = NOW()
    WHERE id = (p_position_delta->>'id')::UUID;
  END IF;

  -- c) Update market AMM
  UPDATE markets
  SET yes_pool     = (p_market_update->>'yes_pool')::NUMERIC,
      no_pool      = (p_market_update->>'no_pool')::NUMERIC,
      yes_price    = (p_market_update->>'yes_price')::NUMERIC,
      no_price     = (p_market_update->>'no_price')::NUMERIC,
      total_volume = COALESCE(total_volume, 0) + (p_market_update->>'volume_delta')::NUMERIC,
      updated_at   = NOW()
  WHERE id = (p_market_update->>'id')::UUID;

  -- d) Insert market_price_history snapshot
  --    total_volume from the just-updated markets row (post step c)
  INSERT INTO market_price_history (
    market_id,
    yes_price,
    no_price,
    total_volume
  ) VALUES (
    (p_market_update->>'id')::UUID,
    (p_market_update->>'history_yes_price')::NUMERIC,
    (p_market_update->>'history_no_price')::NUMERIC,
    COALESCE(
      (SELECT total_volume FROM markets WHERE id = (p_market_update->>'id')::UUID),
      0
    )
  );
END;
$$;
