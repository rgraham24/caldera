# P3-2 Design — Sell Route Atomicity & Payout

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-2-sell-atomicity`
**Base commit:** 3dab0ca (P3-1 merge on main)
**Closes:** SELL-2 (P0), SELL-3 (P0), SELL-4 (concern), SELL-6 (hygiene), SELL-7 (hygiene). Notes SELL-1 already-resolved.

---

## Problem

The sell route (`app/api/trades/sell/route.ts`, 185 lines) has
multiple compounding bugs:

1. **SELL-2:** payout failure is silently swallowed. Route returns
   200 even when DESO send to seller fails. User loses position
   AND payout simultaneously.
2. **SELL-3:** `payout_tx_hash` never persisted (column doesn't exist).
3. **SELL-4:** position UPDATE fires BEFORE payout attempt. Failed
   payout leaves position permanently closed with no recourse.
4. **DB-layer broken:** `trades.tx_hash` is NOT NULL with no default,
   but the sell INSERT doesn't supply it. **Every sell trade INSERT
   silently fails today.** The 3 sells visible in production data
   predate P2-2's NOT NULL constraint (2026-04-25).
5. **No Zod schema** — accepts arbitrary input.
6. **Doesn't use any P2 primitives** — rolls its own DESO send, rate
   fetch, and position math instead of using `transferDeso`,
   `checkDesoSolvency`, `getTradeQuote`.
7. **AMM math wrong on sells (out of audit scope but related):**
   uses spot price, never updates pools, never updates
   `market_price_history`, never bumps `market.total_volume`. This
   is a different bug but tightly coupled to the route we're fixing.
8. **Partial-sell position math wrong:** `total_cost` not decremented,
   `avg_entry_price` not recalculated.
9. **SELL-6:** 10,000 nanos floor (vs 1,000 in `lib/deso/buyback.ts`).
10. **SELL-7:** uses `node.deso.org` (vs canonical `api.deso.org`).
11. **SELL-8:** `positions.deso_staked_nanos` and `positions.txn_hash`
    are unused. Hygiene only — column drops are separate.

**What P3-2 fixes:** all of the above except SELL-8 column drops
and the various drop-the-dead-column hygiene items.

---

## Locked decisions

- **Two write paths, not one RPC:** OPEN inserts the trade row
  (single write, doesn't need a transaction). SETTLE is an RPC
  that atomically marks the trade paid + closes/reduces the
  position + updates AMM. FAIL is a single UPDATE on the trade
  (recovery path, no atomic needed).
- **Idempotency:** client-supplied `idempotencyKey` (UUID) used as
  the trade row's `id`. Existing PRIMARY KEY gives free
  idempotency-on-retry. Plus a partial UNIQUE on
  `(user_id, market_id, side) WHERE payout_status='pending'`
  prevents two concurrent pending sells for the same combo.
- **Use existing P2 primitives:** `transferDeso` for the on-chain
  send, `checkDesoSolvency` for preflight. No more inline send-deso
  + submit-transaction in the route.
- **Use existing `getTradeQuote()` for AMM math.** Pass the sell's
  `gross_amount` (in shares-out terms) through the same quote
  function the buy route uses. The function already supports both
  directions.
- **No fresh-JWT for sells.** Cookie auth (P2-1) is sufficient.
  Sellers can only sell positions they actually own (verified via
  SELECT). Different from creator claim (one-time identity transition).
- **Make `trades.tx_hash` nullable.** Plain UNIQUE constraint already
  treats NULLs as distinct, so multiple NULL rows are permitted.
  Buys still get replay protection (non-null tx_hashes still must
  be unique). Sell rows have `tx_hash=NULL` and use new
  `payout_tx_hash` column instead.
- **New columns on `trades`:** `payout_status`, `payout_tx_hash`,
  `payout_at`, `payout_failed_reason`. All nullable for backward
  compat with existing buy rows.
- **Service-role client** for the route. Aligns with P3-4/P3-5/P3-1.

---

## Sell route flow (12 gates)

After P3-2.3, the sell route is:

```
1.  Body validation (Zod)                     → 400 bad-body
2.  Auth (P2-1 cookie)                        → 401
3.  Rate limit (P2-3, 10/60s/pubkey)          → 429
4.  User lookup                               → 404 user-not-found
5.  Market lookup + status check              → 404 / 400
6.  Position lookup + ownership check         → 404 / 400 not-enough-shares
7.  Quote calculation (getTradeQuote)         (pure)
8.  Solvency preflight (P2-6)                 → 503 platform-insufficient-funds
9.  Idempotency check on (user_id, market_id, side, status='pending')
                                              → 409 sell-in-progress
10. OPEN: INSERT trade row, payout_status='pending'
                                              → 409 if PK or partial UNIQUE violated
11. transferDeso (P2-4 / P3-5.3)              → on failure: UPDATE trade.payout_status='failed'
                                                + reason; return 500 transfer-failed
12. SETTLE: mark_sell_complete RPC            → atomic UPDATE trade + close/reduce position +
                                                update AMM pools/prices/volume +
                                                insert market_price_history row
                                              → on RPC failure: 500 ledger-update-failed
                                                (CRITICAL log; payout already on-chain)
                                              → on success: 200 with trade + payout details
```

---

## Schema migrations (P3-2.2)

```sql
-- New payout columns
ALTER TABLE trades
  ADD COLUMN payout_status TEXT,
  ADD COLUMN payout_tx_hash TEXT,
  ADD COLUMN payout_at TIMESTAMPTZ,
  ADD COLUMN payout_failed_reason TEXT;

ALTER TABLE trades
  ADD CONSTRAINT trades_payout_status_check
  CHECK (payout_status IS NULL OR payout_status IN ('pending', 'paid', 'failed'));

-- Make tx_hash nullable (sells will leave it NULL; buys still set it)
ALTER TABLE trades ALTER COLUMN tx_hash DROP NOT NULL;

-- Partial UNIQUE: only one pending sell per (user, market, side) at a time
CREATE UNIQUE INDEX uq_pending_sell
  ON trades (user_id, market_id, side)
  WHERE payout_status = 'pending';
```

---

## RPC: `mark_sell_complete`

Signature:

```sql
CREATE OR REPLACE FUNCTION mark_sell_complete(
  p_trade_id            UUID,
  p_payout_tx_hash      TEXT,
  p_position_delta      JSONB,  -- { id, qty_to_remove, realized_pnl_delta, total_cost_delta, close }
  p_market_update       JSONB   -- { id, yes_pool, no_pool, yes_price, no_price, volume_delta, history_yes_price, history_no_price }
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- 1. Mark trade paid
  UPDATE trades
  SET payout_status = 'paid',
      payout_tx_hash = p_payout_tx_hash,
      payout_at = NOW()
  WHERE id = p_trade_id AND payout_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade-not-pending: %', p_trade_id;
  END IF;

  -- 2. Update position (close or reduce)
  IF (p_position_delta->>'close')::BOOLEAN THEN
    UPDATE positions
    SET quantity = 0,
        status = 'closed',
        total_cost = GREATEST(COALESCE(total_cost,0) - (p_position_delta->>'total_cost_delta')::NUMERIC, 0),
        realized_pnl = COALESCE(realized_pnl, 0) + (p_position_delta->>'realized_pnl_delta')::NUMERIC,
        updated_at = NOW()
    WHERE id = (p_position_delta->>'id')::UUID;
  ELSE
    UPDATE positions
    SET quantity = quantity - (p_position_delta->>'qty_to_remove')::NUMERIC,
        total_cost = GREATEST(COALESCE(total_cost,0) - (p_position_delta->>'total_cost_delta')::NUMERIC, 0),
        realized_pnl = COALESCE(realized_pnl, 0) + (p_position_delta->>'realized_pnl_delta')::NUMERIC,
        avg_entry_price = CASE
          WHEN quantity - (p_position_delta->>'qty_to_remove')::NUMERIC > 0
          THEN (COALESCE(total_cost,0) - (p_position_delta->>'total_cost_delta')::NUMERIC)
               / (quantity - (p_position_delta->>'qty_to_remove')::NUMERIC)
          ELSE avg_entry_price
        END,
        updated_at = NOW()
    WHERE id = (p_position_delta->>'id')::UUID;
  END IF;

  -- 3. Update market AMM
  UPDATE markets SET
    yes_pool = (p_market_update->>'yes_pool')::NUMERIC,
    no_pool = (p_market_update->>'no_pool')::NUMERIC,
    yes_price = (p_market_update->>'yes_price')::NUMERIC,
    no_price = (p_market_update->>'no_price')::NUMERIC,
    total_volume = COALESCE(total_volume, 0) + (p_market_update->>'volume_delta')::NUMERIC,
    updated_at = NOW()
  WHERE id = (p_market_update->>'id')::UUID;

  -- 4. Insert market_price_history snapshot
  INSERT INTO market_price_history (
    market_id,
    yes_price,
    no_price,
    total_volume
  ) VALUES (
    (p_market_update->>'id')::UUID,
    (p_market_update->>'history_yes_price')::NUMERIC,
    (p_market_update->>'history_no_price')::NUMERIC,
    COALESCE((SELECT total_volume FROM markets WHERE id = (p_market_update->>'id')::UUID), 0)
  );
END;
$$;
```

`SECURITY DEFINER` matches house style. RAISE EXCEPTION on
state mismatch rolls back all changes.

---

## Body schema (Zod)

```ts
const sellSchema = z.object({
  marketId: z.string().uuid(),
  side: z.enum(['yes', 'no']),
  shares: z.number().positive().max(1_000_000),  // generous cap
  idempotencyKey: z.string().uuid(),
});
```

---

## Sub-commits (5)

| Commit | Content |
|--------|---------|
| P3-2.1 | This design doc |
| P3-2.2 | Migration: payout columns + tx_hash nullable + partial UNIQUE + mark_sell_complete RPC |
| P3-2.3 | Route rewrite (185 lines → ~250 lines, full 12 gates) |
| P3-2.4 | Tests (~20 tests covering all gates + happy + failure paths) |
| P3-2.5 | Audit changelog |

---

## Closes

- SELL-2 (P0): payout failure is silently swallowed → fixed
  (status state machine, audit row, propagated errors).
- SELL-3 (P0): payout_tx_hash never persisted → fixed
  (new column, written by RPC).
- SELL-4 (concern): position update before payout → fixed
  (position transitions only inside SETTLE RPC, AFTER payout
  confirmed).
- SELL-6 (hygiene): 10,000 nanos floor → fixed (use 1,000 to
  match buyback).
- SELL-7 (hygiene): node.deso.org → fixed (transferDeso uses
  api.deso.org).
- BONUS: AMM math now correct on sells (pools updated, price
  history recorded, volume bumped).
- BONUS: Partial-sell position math now correct (total_cost
  and avg_entry_price properly maintained).

## NOT closed (out of P3-2 scope)

- SELL-1 (P0): already resolved by P2-1 (auth) — note in changelog.
- SELL-5 (info): no sell fees, correct per tokenomics — note.
- SELL-8 (hygiene): unused position columns — separate column-drop
  migration in a hygiene branch.

## NOT in P3-2

- Drop unused position columns (SELL-8)
- Drop trades.coin_holder_pool_amount column (P3-1 hygiene carryover)
- Drop coin_holder_distributions table (P3-1 hygiene carryover)
- Drop creators.total_fees_distributed column (P3-1 hygiene carryover)

---

## Open questions

### OQ-1: Should `tx_hash` and `payout_tx_hash` ever both be set?

No. Buy trades have `tx_hash` (user→platform), `payout_tx_hash`
NULL. Sell trades have `tx_hash` NULL, `payout_tx_hash` set.
Future "claim winnings" trades (P3-3) will likely have
`tx_hash` NULL, `payout_tx_hash` set. They're mutually exclusive
by trade type. We don't add a CHECK constraint enforcing this
(seems over-engineered for now); document in the design doc.

### OQ-2: Should the partial UNIQUE include `payout_status='pending'` or all non-paid states?

`pending` only. Once a sell is `failed`, the user can retry with
a new idempotency key. The retry is allowed; what we prevent is
TWO concurrent in-flight sells for the same combo.

### OQ-3: What about replay attacks on sells?

A buy replay re-uses an on-chain tx the attacker doesn't actually
own. P2-2 verifyTx + UNIQUE on `tx_hash` blocks that.

A sell replay would mean: user A submits sell, payout succeeds,
user A re-submits the same idempotency key. Hits PK violation
on trade_id → 409. Or with a fresh idempotency key but same
position state, the partial UNIQUE catches concurrent in-flights;
serial retries can succeed only if the position still has shares
(no double-payout).

The position lookup gate (Gate 6) checks `quantity >= shares`.
Once shares have been sold, position quantity decreases. Second
sell of "the same" shares finds insufficient quantity and 400s.

So replay is structurally impossible. Good.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc. Two-write-paths pattern (OPEN INSERT, SETTLE RPC). Idempotency via client-supplied UUID + partial UNIQUE. Fold AMM-math fix into P3-2 scope (out of audit but tightly coupled). Make `tx_hash` nullable for sell rows. Use existing P2 primitives (transferDeso, solvency, getTradeQuote). |
