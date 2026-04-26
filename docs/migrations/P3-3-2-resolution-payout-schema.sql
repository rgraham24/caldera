-- P3-3.2 — Resolution payout schema + atomic_resolve_market RPC
-- Branch: feat/p3-3-resolution-payout
-- Applied to production: 2026-04-26
--
-- Changes:
--   1. New table position_payouts (audit ledger for winning positions)
--   2. CHECK constraint on position_payouts.claim_status
--   3. UNIQUE index on position_payouts(position_id)
--   4. UNIQUE index on market_resolutions(market_id) — defensive
--      (1 row, 0 dupes pre-migration)
--   5. CHECK constraint on positions.status (table currently has none;
--      production data: 28 'open' + 1 'closed' + 0 'settled')
--   6. atomic_resolve_market RPC: writes markets UPDATE + positions
--      UPDATE + position_payouts INSERTs + market_resolutions audit
--      INSERT in one transaction. Idempotent via WHERE status='open'.

-- 1. Audit ledger
CREATE TABLE position_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  winning_shares NUMERIC NOT NULL,
  payout_amount_usd NUMERIC NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payout_amount_nanos BIGINT,
  deso_usd_rate_at_claim NUMERIC,
  claim_tx_hash TEXT,
  claim_failed_reason TEXT,
  claimed_at TIMESTAMPTZ,
  claim_status TEXT NOT NULL DEFAULT 'pending'
);

-- 2. Status CHECK
ALTER TABLE position_payouts
  ADD CONSTRAINT position_payouts_status_check
  CHECK (claim_status IN ('pending', 'in_flight', 'claimed', 'failed', 'blocked_insolvent'));

-- 3. UNIQUE on position_id (one payout per position max)
CREATE UNIQUE INDEX uq_position_payouts_position
  ON position_payouts (position_id);

-- 4. UNIQUE on market_resolutions (defensive — 1 row, 0 dupes)
CREATE UNIQUE INDEX uq_market_resolutions_market
  ON market_resolutions (market_id);

-- 5. CHECK on positions.status
ALTER TABLE positions
  ADD CONSTRAINT positions_status_check
  CHECK (status IN ('open', 'closed', 'settled'));

-- 6. atomic_resolve_market RPC
CREATE OR REPLACE FUNCTION atomic_resolve_market(
  p_market_id UUID,
  p_outcome TEXT,
  p_resolved_by_user_id UUID DEFAULT NULL,
  p_resolution_note TEXT DEFAULT NULL,
  p_source_url TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_positions_settled INT := 0;
  v_winners_count INT := 0;
  v_total_payout_usd NUMERIC := 0;
  v_pos RECORD;
  v_is_winner BOOLEAN;
  v_realized_pnl NUMERIC;
BEGIN
  IF p_outcome NOT IN ('yes', 'no', 'cancelled') THEN
    RAISE EXCEPTION 'invalid-outcome: %', p_outcome;
  END IF;

  UPDATE markets
  SET status = 'resolved',
      resolution_outcome = p_outcome,
      resolved_at = NOW(),
      resolution_note = COALESCE(p_resolution_note, resolution_note),
      updated_at = NOW()
  WHERE id = p_market_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'market-already-resolved-or-not-found: %', p_market_id;
  END IF;

  FOR v_pos IN
    SELECT id, user_id, side, quantity, total_cost
    FROM positions
    WHERE market_id = p_market_id AND status = 'open'
  LOOP
    IF p_outcome = 'cancelled' THEN
      v_is_winner := FALSE;
    ELSE
      v_is_winner := (v_pos.side = p_outcome);
    END IF;

    IF v_is_winner THEN
      v_realized_pnl := v_pos.quantity - COALESCE(v_pos.total_cost, 0);
    ELSE
      v_realized_pnl := -COALESCE(v_pos.total_cost, 0);
    END IF;

    UPDATE positions
    SET status = 'settled',
        realized_pnl = v_realized_pnl,
        updated_at = NOW()
    WHERE id = v_pos.id;

    v_positions_settled := v_positions_settled + 1;

    IF v_is_winner AND v_pos.quantity > 0 THEN
      INSERT INTO position_payouts (
        position_id, user_id, market_id,
        winning_shares, payout_amount_usd, claim_status
      ) VALUES (
        v_pos.id, v_pos.user_id, p_market_id,
        v_pos.quantity, v_pos.quantity, 'pending'
      );
      v_winners_count := v_winners_count + 1;
      v_total_payout_usd := v_total_payout_usd + v_pos.quantity;
    END IF;
  END LOOP;

  INSERT INTO market_resolutions (
    market_id, resolved_by_user_id, outcome, source_url, notes
  ) VALUES (
    p_market_id, p_resolved_by_user_id, p_outcome, p_source_url, p_resolution_note
  );

  RETURN jsonb_build_object(
    'positions_settled', v_positions_settled,
    'winners_count', v_winners_count,
    'total_payout_usd', v_total_payout_usd
  );
END;
$$;
