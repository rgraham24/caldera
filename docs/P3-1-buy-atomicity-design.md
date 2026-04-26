# P3-1 Design — Buy Route Atomicity

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-1-buy-atomicity`
**Base commit:** 535bd09 (P3-5 merge on main)
**Closes:** BUY-4 (P0), BUY-6 (P2), notes BUY-8 already-resolved.

---

## Problem

The buy route (`app/api/trades/route.ts`, 575 lines) does ten or
more sequential synchronous DB writes after on-chain verification,
none wrapped in a transaction. Any can fail mid-flight, leaving the
ledger in a partial state:

| Write | What | Failure mode |
|-------|------|--------------|
| 1 | trades INSERT | Already returns 409/500 cleanly |
| 2 | positions SELECT + UPDATE/INSERT | If insert fails, trade exists with no position |
| 3 | fee_earnings INSERT (platform) | Errors logged, execution continues — silent partial state |
| 4 | fee_earnings INSERT (holder_rewards_pool) | Same |
| 5 | fee_earnings INSERT (auto_buy_pool) | Same |
| 6 | fee_earnings INSERT (creator or creator_escrow) | Same |
| 7 | increment_unclaimed_escrow RPC call | Same |
| 8 | markets UPDATE (pools + price) | Already done before fees — pool state can advance without fee record |
| 9 | coin_holder_distributions INSERT (legacy, dead) | — |
| 10 | creators.total_fees_distributed UPDATE (legacy, dead) | — |

Production data shows the structural risk: 39/54 trades (last 30
days) have zero fee_earnings — though most are pre-v2 noise, the
v2 path can still partial-fail and we'd never detect it.

P3-1 wraps the synchronous writes in a single PostgreSQL function
called `atomic_record_trade`. Either all writes succeed and a row
appears in `trades` + matching position + matching fee rows, or
nothing happens and the route returns an error.

---

## Locked decisions

- **Atomic scope:** synchronous writes only (trade, position,
  fee_earnings × N, escrow increment, markets pool/price/volume).
  Fire-and-forget calls (buyback, snapshot, market_price_history,
  buyback_events) stay outside — they have their own idempotency.
- **No on-chain transfers in P3-1.** Buy is "user already paid
  on-chain via DeSo creator-coin purchase, route records the
  effect." P2-2 verifies the on-chain side. P3-1 only protects
  the DB ledger.
- **Pass JSONB params, not 20 individual args.** Easier to maintain.
  Validation happens in the route via Zod before calling.
- **Compute position deltas inside the RPC**, not in TS. The RPC
  reads the locked row inside the transaction, eliminating
  read-then-write races.
- **Use existing positions UNIQUE constraint** on
  (user_id, market_id, side) for ON CONFLICT. Already exists.
  Zero duplicates in production today.
- **Take final values for markets UPDATE.** AMM math is
  order-independent (pool changes from THIS trade only), so
  pre-computed values are safe.
- **Service-role client** for the route's RPC call. Future-proofs
  against RLS and aligns with P3-4/P3-5 patterns. Currently
  trades-side tables have RLS disabled, so this is defensive.
- **Delete dead `coin_holder_distributions` and
  `creators.total_fees_distributed` writes.** Legacy v1 paths,
  no rows since 2026-04-06.
- **BUY-6 fold:** add `.max(10_000)` to amount in Zod schema.
  One-line change, fits naturally in P3-1.3.

---

## RPC: `atomic_record_trade`

Signature:

```sql
CREATE OR REPLACE FUNCTION atomic_record_trade(
  p_trade   JSONB,   -- full trades row to insert
  p_market  JSONB,   -- markets UPDATE: { id, yes_pool, no_pool, yes_price, no_price, volume_delta }
  p_position_delta JSONB, -- { user_id, market_id, side, qty_delta, cost_delta, fees_delta }
  p_fees    JSONB[], -- array of fee_earnings rows to insert
  p_escrow_creator_id UUID DEFAULT NULL,  -- if set, increment_unclaimed_escrow
  p_escrow_amount     NUMERIC DEFAULT NULL  -- amount to increment
) RETURNS UUID  -- the new trade.id
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_trade_id UUID;
BEGIN
  -- 1. Insert trade. INSERT ... RETURNING id
  --    Unique violation on tx_hash → re-raise (route catches as 409)
  INSERT INTO trades SELECT * FROM jsonb_populate_record(NULL::trades, p_trade)
  RETURNING id INTO v_trade_id;

  -- 2. Update market: pools, prices, volume
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

  -- 3. Position upsert with deltas (race-safe inside transaction)
  INSERT INTO positions (
    user_id, market_id, side,
    quantity, total_cost, fees_paid, status,
    avg_entry_price, created_at, updated_at
  ) VALUES (
    (p_position_delta->>'user_id')::UUID,
    (p_position_delta->>'market_id')::UUID,
    p_position_delta->>'side',
    (p_position_delta->>'qty_delta')::NUMERIC,
    (p_position_delta->>'cost_delta')::NUMERIC,
    (p_position_delta->>'fees_delta')::NUMERIC,
    'open',
    -- avg = cost / qty, with safe divide
    CASE
      WHEN (p_position_delta->>'qty_delta')::NUMERIC > 0
      THEN (p_position_delta->>'cost_delta')::NUMERIC / (p_position_delta->>'qty_delta')::NUMERIC
      ELSE 0
    END,
    NOW(), NOW()
  )
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    quantity        = positions.quantity + EXCLUDED.quantity,
    total_cost      = positions.total_cost + EXCLUDED.total_cost,
    fees_paid       = positions.fees_paid + EXCLUDED.fees_paid,
    avg_entry_price = CASE
      WHEN positions.quantity + EXCLUDED.quantity > 0
      THEN (positions.total_cost + EXCLUDED.total_cost) / (positions.quantity + EXCLUDED.quantity)
      ELSE positions.avg_entry_price
    END,
    status          = 'open',
    updated_at      = NOW();

  -- 4. Insert fee_earnings rows (loop over JSONB array)
  IF p_fees IS NOT NULL AND array_length(p_fees, 1) > 0 THEN
    FOR i IN 1..array_length(p_fees, 1) LOOP
      INSERT INTO fee_earnings
        SELECT * FROM jsonb_populate_record(NULL::fee_earnings, p_fees[i]);
    END LOOP;
  END IF;

  -- 5. Increment unclaimed escrow if applicable
  IF p_escrow_creator_id IS NOT NULL AND p_escrow_amount IS NOT NULL AND p_escrow_amount > 0 THEN
    PERFORM increment_unclaimed_escrow(p_escrow_creator_id, p_escrow_amount);
  END IF;

  RETURN v_trade_id;
END;
$$;
```

Errors raised inside the function automatically roll back all
changes. The route catches:
- Unique violation on `trades.tx_hash` (code 23505) → 409 replay
- Any other RAISE EXCEPTION → 500 with reason
- `market-not-found` → 404

---

## Route changes (P3-1.3)

The route currently has 10+ sequential awaits after verifyTx.
After P3-1, those collapse into ONE call:

```ts
const { data: tradeId, error: rpcError } = await supabase
  .rpc('atomic_record_trade', {
    p_trade: tradeRow,
    p_market: marketUpdate,
    p_position_delta: positionDelta,
    p_fees: feeRows,
    p_escrow_creator_id: escrowCreatorId,
    p_escrow_amount: escrowAmount,
  });

if (rpcError) {
  if (rpcError.code === '23505') {
    return NextResponse.json({ reason: 'replay' }, { status: 409 });
  }
  return NextResponse.json(
    { reason: rpcError.message },
    { status: 500 }
  );
}
```

Then the fire-and-forget calls happen AFTER (so they fire only if
the trade actually committed):
- `executeTokenBuyback(autoBuyPoolFeeId, ...)` — buyback module
- `snapshotHolders(tradeId, ...)` — holder snapshot
- `buyback_events INSERT` — event log
- `market_price_history INSERT` — price ticker

### Other route changes

- **Swap `createClient()` → `createServiceClient()`** at the
  service-role boundary (defensive; matches P3-4/P3-5).
- **Delete dead `coin_holder_distributions` INSERT** + the
  `creators.total_fees_distributed` UPDATE that pairs with it.
  ~30 lines removed.
- **Delete the `coin_holder_pool_amount: fees.coinHolderPoolFee`
  field** from the trades INSERT. The column stays in the schema
  for now (column drop = separate hygiene migration); but new
  trades stop writing to it. Going forward `coin_holder_pool_amount`
  will be NULL on new rows. This is fine — no consumers downstream.
- **BUY-6 amount cap:** change `amount: z.number().positive()` to
  `amount: z.number().positive().max(10_000)` in the Zod schema.

---

## Test strategy (P3-1.3)

New tests in `__tests__/api/trades-atomicity.test.ts` cover the
RPC integration:

- Happy path: route calls RPC with correct JSONB shape, returns 200
- 23505 unique violation → 409 replay
- Other RPC error → 500 with reason
- BUY-6: amount > 10_000 → 400 with reason
- Verify fire-and-forget calls happen AFTER RPC success (don't fire
  if RPC fails)
- Verify legacy code paths are gone (assert no
  `coin_holder_distributions` INSERT under any branch)

Existing `trades-auth.test.ts` (494 lines, 18 tests) covers gates
1-5; we keep all of it. Atomicity tests are additive.

---

## Sub-commits (4)

| Commit | Content |
|--------|---------|
| P3-1.1 | This design doc |
| P3-1.2 | DB migration: atomic_record_trade RPC |
| P3-1.3 | Route changes + dead code deletion + service-role + BUY-6 cap + tests |
| P3-1.4 | Audit changelog |

---

## Out of P3-1 scope

- **Drop `coin_holder_pool_amount` column** from trades — separate
  hygiene migration after we confirm no analytics queries rely on it
- **Drop `coin_holder_distributions` table** — same reasoning
- **Drop `creators.total_fees_distributed` column** — same
- **executeTokenBuyback hardening** — already has its own status
  ledger; revisit if it shows reliability issues in production
- **Reconciliation tooling** — Phase 4

---

## Dependencies

- Postgres function `increment_unclaimed_escrow` (existing)
- Existing positions UNIQUE constraint
- `lib/supabase/server.ts::createServiceClient` (P3-4)
- `lib/deso/verifyTx.ts` (P2-2)
- `lib/auth` (P2-1)
- `lib/rate-limit` (P2-3)
- All other Phase 2 primitives already wired in route

No new npm deps. No new tables.

---

## Open questions

### OQ-1: Should the RPC validate the JSONB shape?

The route passes JSONB; PostgreSQL doesn't enforce shape unless we
add explicit `IF p_trade->>'user_id' IS NULL THEN RAISE` checks.

**Decision:** Trust the route's Zod validation. If invalid JSONB
gets in, `jsonb_populate_record` will raise its own (less friendly)
error and roll back. Don't double-validate.

### OQ-2: Should we also add a CHECK to fee_earnings.amount > 0?

Currently no constraint. A buggy calculator could insert zero or
negative fees. Out of P3-1 scope (separate hygiene); add to a
hygiene tracking list.

### OQ-3: What about the `holder_rewards` table writes?

`holder_rewards` rows are written by `snapshotHolders` which is
fire-and-forget. Outside RPC scope. Has its own idempotency
(UNIQUE constraint on (trade_id, holder_deso_public_key)).

### OQ-4: What about race between buy and sell on same position?

Each route writes through the RPC pattern. P3-2 will follow the
same pattern. ON CONFLICT serializes within Postgres.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc. JSONB params over 20-arg signature. Compute position deltas inside RPC for race safety. Use existing UNIQUE constraint. Fold BUY-6 amount cap. Delete dead v1 paths. |
