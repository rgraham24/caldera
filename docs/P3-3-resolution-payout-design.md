# P3-3 Design — Market Resolution Payout

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-3-resolution-payout`
**Base commit:** 8131737 (P3-2 merge on main)
**Closes:** RESOLUTION-1 (P0), RESOLUTION-2 (P1), RESOLUTION-3 (P0), RESOLUTION-6 (P0). Defers RESOLUTION-4 (dispute) and RESOLUTION-5 (dry-run cron).

---

## Problem

When a market resolves, no DESO ever flows to winners. Per audit:

- **RESOLUTION-1 (P0):** No payout mechanism exists. Three routes
  settle DB only; zero DESO moves. Platform wallet holds all
  winnings with no code path to return them.
- **RESOLUTION-2 (P1):** Three (actually four) redundant resolution
  routes — `app/api/admin/resolve-market/route.ts`,
  `app/api/markets/[id]/resolve/route.ts`,
  `app/api/admin/auto-resolve/route.ts`,
  `app/api/cron/resolve-crypto-markets/route.ts` — all implement
  N+1 settle loops independently with divergent field names and
  divergent admin auth.
- **RESOLUTION-3 (P0):** No solvency check at any point in the
  flow. Per-claim solvency check is the fix.
- **RESOLUTION-6 (P0):** No "claim my winnings" UI exists.

Production data state:
- 39,463 resolved markets (mostly auto-generated 1hr crypto with
  no traders)
- 0 settled positions in production (zero real winners ever paid out)
- 1 row in `market_resolutions` audit table (most resolves silently
  skip writing it)

P3-3 builds the missing two-stage resolution payout flow.

---

## Locked decisions

### Architecture: two-stage pull-based

**Stage 1 — Resolve (admin/cron):** atomic RPC call writes
markets + positions + position_payouts + market_resolutions in
one transaction.

**Stage 2 — Claim (user):** user clicks "Claim $X" on portfolio
→ `POST /api/positions/[id]/claim-winnings` → solvency check
→ transferDeso → ledger update.

Same pattern as P3-4 holder rewards (build once, use thrice now).

### Why per-position not bulk

Memory #9 locks pull-based with per-user atomicity. Per-position
goes one step further: each winning position has its own payout
row, claimable independently. Matches Polymarket UX. Simpler
atomicity per claim. Allows partial claims if user has multiple
winning positions (one might be insolvent-blocked while others
proceed).

### P&L formula (canonical)

Winning shares × $1 per share = payout. Two existing routes use
`quantity * 1.0 - total_cost` for the realized_pnl on winners
and `-total_cost` for losers. Route 2 uses an equivalent
`payout - total_cost`. We canonicalize on:

```
winner: payout_amount_usd = quantity (in USD); realized_pnl = quantity - total_cost
loser:  no payout row inserted; realized_pnl = -total_cost
```

`payout_amount_usd` is the audit table's record of what the
platform OWES the user. `realized_pnl` is the user's gain/loss.
Different numbers stored in different places.

### Audit table: position_payouts

Modeled after `holder_rewards`. UNIQUE on `position_id` so each
position resolves to exactly one payout row.

### Atomic RPC: atomic_resolve_market

One transaction writes:
1. UPDATE markets SET status='resolved', resolution_outcome,
   resolved_at, resolution_note (filtered WHERE status='open' to
   prevent double-resolve)
2. For each open position in the market:
   - UPDATE position SET status='settled', realized_pnl computed
3. For each WINNING open position (qty * outcome > 0):
   - INSERT position_payouts (claim_status='pending')
4. INSERT market_resolutions row

If markets WHERE check finds nothing → RAISE EXCEPTION
'market-already-resolved'. Idempotent on retry — second call
sees status='resolved' and rolls back cleanly.

### Consolidation: lib/markets/resolution.ts

All FOUR resolve routes call shared `resolveMarket()` function
which calls `atomic_resolve_market` RPC. Eliminates N+1 loops,
divergent field names, and divergent auth handling. Routes
become thin wrappers handling auth + validation specific to their
caller (admin password vs cron secret vs admin DeSo key).

### Auth consolidation: lib/admin/auth.ts

Canonical ADMIN_KEYS lives at `lib/admin/market-generator.ts`
(4 keys). New `lib/admin/auth.ts` exports
`isAdminAuthorized(req)` that checks:
1. `body.adminPassword === ADMIN_PASSWORD` env, OR
2. `body.desoPublicKey ∈ ADMIN_KEYS` array

Both routes 1 and 2 use this. Route 3 (cron auto-resolve) and
the resolve-crypto-markets cron use Vercel cron auth header.
Eliminates the divergent inline-keys-in-route-2 bug.

### Claim route: POST /api/positions/[id]/claim-winnings

Per-position. 12 gates following the P3-4 pattern:
1. P2-1 cookie auth → 401
2. P2-3 rate limit → 429
3. Load position_payouts row by position_id → 404 if not found
4. Verify ownership: position.user_id === authed.userId → 403
5. Verify claim_status='pending' → 409 if already claimed/in_flight
6. Compute amount_nanos at current DESO rate → 503 if rate fetch fails
7. Solvency preflight (P2-6) → 503 platform-insufficient-funds
   (sets claim_status='blocked_insolvent' so admin sees the queue)
8. Idempotency: UPDATE claim_status='in_flight' WHERE 'pending'
   → 409 if 0 rows (race lost)
9. transferDeso (P3-5.3 primitive)
10. On success: UPDATE claim_status='paid' + claim_tx_hash + claimed_at
11. On failure: UPDATE claim_status='failed' + claim_failed_reason
12. Return 200 / 500

### Frontend: surgical add to existing portfolio settled tab

The settled tab in `portfolio-client.tsx` already exists with
columns Market | Side | Outcome | PnL. Add a "Claim" column with
state-driven button:
- claim_status='pending': "Claim $X" (clickable)
- claim_status='in_flight': "Claiming..." (spinner)
- claim_status='paid': "✓ Claimed" + tx link
- claim_status='failed': "Retry" (clickable, fresh attempt)
- claim_status='blocked_insolvent': "Pending platform funding"
- No payout row (loser): show "—"

NEW component `<PositionClaimButton>` per row, mirrors the
PendingRewards pattern from P3-4.

### Out of scope (deferred)

- **RESOLUTION-4 (P2):** Dispute mechanism. Future work.
- **RESOLUTION-5 (P1):** Cron dry-run mode. Hygiene branch
  post-merge.
- Hygiene: drop `resolved_outcome` (duplicate of
  `resolution_outcome`, all NULL), drop `deso_staked_nanos` and
  `txn_hash` from positions (SELL-8 carryover), drop the
  `resolution_source_url` / `resolution_note` /
  `resolution_source` markets-table cruft. Separate hygiene
  branch.

---

## Schema migrations (P3-3.2)

```sql
-- 1. New audit table
CREATE TABLE position_payouts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id              UUID NOT NULL REFERENCES positions(id),
  user_id                  UUID NOT NULL REFERENCES users(id),
  market_id                UUID NOT NULL REFERENCES markets(id),
  -- Resolution-time fields (computed when atomic_resolve_market fires):
  winning_shares           NUMERIC NOT NULL,           -- = position.quantity for winners
  payout_amount_usd        NUMERIC NOT NULL,           -- USD value owed (= winning_shares for $1/share markets)
  resolved_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Claim-time fields:
  payout_amount_nanos      BIGINT,
  deso_usd_rate_at_claim   NUMERIC,
  claim_tx_hash            TEXT,
  claim_failed_reason      TEXT,
  claimed_at               TIMESTAMPTZ,
  -- State machine:
  claim_status             TEXT NOT NULL DEFAULT 'pending'
);

ALTER TABLE position_payouts
  ADD CONSTRAINT position_payouts_status_check
  CHECK (claim_status IN ('pending','in_flight','claimed','failed','blocked_insolvent'));

CREATE UNIQUE INDEX uq_position_payouts_position
  ON position_payouts (position_id);

-- 2. Defensive UNIQUE on market_resolutions (currently 1 row, 0 dupes)
CREATE UNIQUE INDEX uq_market_resolutions_market
  ON market_resolutions (market_id);

-- 3. CHECK constraint on positions.status (currently no constraint)
ALTER TABLE positions
  ADD CONSTRAINT positions_status_check
  CHECK (status IN ('open', 'closed', 'settled'));

-- 4. The atomic_resolve_market RPC
-- (full body in design doc commit, ~80 lines plpgsql)
```

---

## RPC signature

```sql
CREATE OR REPLACE FUNCTION atomic_resolve_market(
  p_market_id          UUID,
  p_outcome            TEXT,                -- 'yes' | 'no' | 'cancelled'
  p_resolved_by_user_id UUID DEFAULT NULL,  -- NULL for cron
  p_resolution_note    TEXT DEFAULT NULL,
  p_source_url         TEXT DEFAULT NULL
) RETURNS JSONB                              -- { positions_settled, winners_count, total_payout_usd }
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
-- Atomically:
-- 1. UPDATE markets WHERE status='open' (RAISE if not found)
-- 2. For each open position: settle (set realized_pnl)
-- 3. For each winning position: INSERT position_payouts pending
-- 4. INSERT market_resolutions audit row
$$;
```

---

## Sub-commits (9)

| Commit | Content |
|--------|---------|
| P3-3.1 | This design doc |
| P3-3.2 | DB migration: position_payouts table, atomic_resolve_market RPC, market_resolutions UNIQUE, positions.status CHECK |
| P3-3.3 | lib/markets/resolution.ts shared logic + lib/admin/auth.ts consolidated admin auth |
| P3-3.4 | Refactor 4 resolve routes to use shared lib |
| P3-3.5 | Tests for shared lib + refactored routes |
| P3-3.6 | New POST /api/positions/[id]/claim-winnings route |
| P3-3.7 | Tests for claim route |
| P3-3.8 | Frontend: claim button in portfolio settled tab |
| P3-3.9 | Audit changelog |

---

## Closes

- RESOLUTION-1 (P0): no payout mechanism → fixed (claim flow)
- RESOLUTION-2 (P1): redundant routes → fixed (consolidated)
- RESOLUTION-3 (P0): no solvency check → fixed (per-claim P2-6)
- RESOLUTION-6 (P0): no claim UI → fixed (portfolio button)

## NOT closed (deferred)

- RESOLUTION-4 (P2): dispute mechanism
- RESOLUTION-5 (P1): dry-run cron mode

---

## Open questions

### OQ-1: What happens to a 'cancelled' market?

A market can resolve as 'yes', 'no', or 'cancelled'. For
cancelled, all positions are losers (no winning side). But the
audit doc and current routes 1+3 don't even support cancelled.
Route 2 supports it.

**Decision:** atomic_resolve_market accepts 'cancelled'. For
cancelled markets, NO payout rows are inserted (no one wins).
All positions get realized_pnl = -total_cost (treated as losers).

If we ever want to refund users on cancelled markets (return
their total_cost), that's a future feature. For now: cancelled
= losses for everyone. Document.

### OQ-2: Should the cron resolve-crypto-markets call shared lib?

It currently doesn't write to market_resolutions and has no
positions to settle (no traders on those markets). The shared
lib's resolveMarket() will work fine even with 0 positions —
loop just doesn't execute. So yes, we wire it up. Cost: zero
(no extra DB writes for empty position lists). Benefit: future
positions on those markets correctly produce payouts.

### OQ-3: How do we handle the existing 39k resolved markets?

They have status='resolved' but never had positions to settle.
**No retro-fitting needed.** No payouts owed. P3-3 just changes
behavior going forward.

### OQ-4: What about partial claim retries?

User claims, transferDeso fails, claim_status='failed'. User
hits retry button → state goes 'failed' → 'in_flight' → ...
That's straightforward. Failed → in_flight transition allowed
in claim route.

But: idempotency around concurrent retries. Two browser tabs
both click Retry simultaneously → both UPDATE claim_status to
'in_flight'. We use `WHERE claim_status IN ('pending', 'failed')`
in the UPDATE. The row that finds 1 row updated proceeds; the
other finds 0 rows updated → returns 409.

### OQ-5: Does the user need fresh-JWT for claim-winnings?

Memory #12 lists "winner claims >$100" as fresh-JWT required.
Most claims will be small. Decision: NO fresh-JWT in P3-3 v1.
Cookie auth + per-position UNIQUE row is sufficient. Add
fresh-JWT later if abuse appears.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc. Two-stage architecture (atomic resolve, pull claim). Per-position claim, not bulk. Consolidate 4 resolve routes into lib/markets/resolution.ts. Consolidate ADMIN_KEYS into lib/admin/auth.ts. Defer RESOLUTION-4/5 to hygiene. |
