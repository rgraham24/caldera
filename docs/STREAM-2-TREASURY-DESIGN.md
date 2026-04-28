# Stream 2 — Treasury Dashboard (Phase 1)

**Status:** Design — pending implementation
**Branch:** `feat/stream-2-treasury-dashboard`
**Date:** 2026-04-28
**Surfaced by:** Stream 1 deep audit on 2026-04-28 — platform wallet contains
mixed liability + revenue + reserves with no separation, and no visibility
into solvency on a per-asset basis.

---

## Goal

Answer one question at any moment:
> "How much of what's in the platform wallet is actually mine vs. owed to users?"

Phase 1 builds the backend math + an admin API endpoint. UI is deferred to
Phase 2 (a future session).

---

## Non-goals

- No "sweep to personal wallet" functionality (Stream 3 territory — touches
  platform seed)
- No historical tracking / charts / time-series storage
- No alerts / notifications (Stream 3)
- No UI page (Phase 2, deferred)
- No price oracle improvements (uses existing `getCreatorCoinData` and
  `fetchDesoUsdRate`)

---

## Context: what the platform wallet holds

The platform wallet (DeSo pubkey `BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7`)
holds:

1. **DESO** — operational currency. Pays out: position payouts, creator
   claims, sells, network fees.
2. **Creator coins** — accumulated by 0.5% auto-buy on every trade. Used
   to pay holder rewards in the relevant token (per locked tokenomics
   memory #1, #2, #10).
3. Vestigial: `$CalderaPlatform` founder reward (~2.78 coins, unrecoverable,
   ignored in this dashboard).

The wallet receives 100% of every trade's gross DESO via a user-signed
BASIC_TRANSFER. From that pool, it pays out the various obligations. The
1% platform fee is the implicit residual — never moved on-chain, simply
retained.

This means the wallet at any moment contains a mix of:
- Money the platform genuinely earned (revenue)
- Money owed to active position holders (liability)
- Money owed to coin holders (holder rewards reserve)
- Money owed to unclaimed creators (escrow)
- Money already promised to resolved-but-unclaimed positions (pending payouts)

The dashboard separates these.

---

## Liability formula

### DESO liability

```
deso_liability_nanos =
    open_position_worst_case_nanos     // Σ open positions: quantity × $1/share, USD→DESO
  + pending_position_payouts_nanos     // Σ position_payouts where claim_status IN ('pending','in_flight')
  + creator_escrow_nanos               // Σ creators.unclaimed_earnings_escrow USD→DESO
```

Notes:
- **Worst-case open position liability** = total shares outstanding × $1/share.
  Conservative — assumes every position resolves YES at full payout. Realistic
  expected liability is ~50% of this (probability-weighted), but for solvency
  we use worst-case so we know the platform could pay if everything wins.
- **Pending position_payouts** are already-resolved positions awaiting user
  claim — these are concrete obligations, not probabilistic.
- **Creator escrow** is per-creator USD held until claim — these are concrete.

### Creator-coin liability (per token slug)

```
For each slug in pending holder_rewards:
  coin_price_deso = getCreatorCoinPrice(slug)        // DESO per coin (bonding curve)
  coin_price_usd  = coin_price_deso × deso_usd_rate  // USD per coin

  For each pending row:
    coin_amount = amount_usd / coin_price_usd        // coins owed (decimal)

  liability_in_nanos = Σ(coin_amount) × 1e9          // sum in nanos
```

Important: `getCreatorCoinPrice(slug)` returns the bonding-curve price in
**DESO per coin**, not USD per coin. The conversion to USD requires
multiplying by `deso_usd_rate` first. Mixing units here would inflate
liability by ~5x at current DESO price (~$5/DESO).

Notes:
- Holder rewards accrue USD-denominated; conversion to coin nanos happens at
  CLAIM TIME (not accrual). The dashboard does the same conversion in real-time
  using the current price.
- `amount_creator_coin_nanos` is NULL on pending rows — only populated on
  claimed rows. **Do not** attempt to sum `amount_creator_coin_nanos` for
  pending liability.

---

## Extractable revenue

```
extractable[asset] = wallet_balance[asset]
                   - liability[asset]
                   - operational_buffer[asset]
```

Status thresholds:
- `'healthy'`    — extractable >= operational_buffer
- `'tight'`      — 0 < extractable < operational_buffer
- `'insolvent'`  — extractable <= 0
- `'unknown'`    — price fetch failed; liability uncomputable for this asset

Note: when operational_buffer is 0 (default for creator coins), `'tight'`
is unreachable — assets are either `'healthy'` (extractable > 0) or
`'insolvent'` (extractable <= 0). This is intentional; tune the buffer
in Phase 2 once claim-rate data is available.

### Operational buffer values (Phase 1)

| Asset | Buffer | Rationale |
|-------|--------|-----------|
| DESO | 0.5 DESO (~500M nanos) | Covers ~10 in-flight tx fees + slippage on auto-buys |
| Each creator coin | 0 nanos | Hard to tune without claim-frequency data; revisit when alerts surface tightness |

Both are conservative starting values. Phase 2 work may tune them based on
observed claim-rate data.

---

## TreasurySnapshot type

```typescript
type AssetStatus = 'healthy' | 'tight' | 'insolvent' | 'unknown';
// 'unknown' applies when a creator coin's price fetch fails — liability
// for that asset cannot be computed; the whole snapshot is still returned
// but with a warning in `warnings[]` and the asset's status set to 'unknown'.

interface DesoBreakdown {
  open_position_worst_case_nanos: bigint;
  pending_position_payouts_nanos: bigint;
  creator_escrow_nanos: bigint;
}

interface CoinBreakdown {
  pending_holder_rewards_usd: number;       // total USD owed for this coin
  pending_holder_rewards_rows: number;      // number of pending rows
  current_coin_price_usd: number;           // price used for conversion
}

interface TreasurySnapshot {
  asOf: string;                              // ISO timestamp
  desoUsdRate: number;                       // USD per DESO (snapshot)

  walletBalances: {
    deso_nanos: bigint;
    creatorCoins: Record<string, bigint>;    // slug → coin nanos
  };

  liability: {
    deso_nanos: bigint;
    deso_breakdown: DesoBreakdown;
    creatorCoins: Record<string, {
      nanos: bigint;
      breakdown: CoinBreakdown;
    }>;
  };

  extractable: {
    deso_nanos: bigint;                      // can be negative
    creatorCoins: Record<string, bigint>;    // can be negative
  };

  status: {
    deso: AssetStatus;
    creatorCoins: Record<string, AssetStatus>;
  };

  warnings: string[];                        // human-readable warnings
}
```

---

## File structure

```
lib/finance/liability.ts                       ← module
__tests__/lib/finance/liability.test.ts        ← unit tests

app/api/admin/treasury/route.ts                ← admin endpoint
__tests__/api/treasury.test.ts                 ← integration tests
```

### `lib/finance/liability.ts` — exported API

```typescript
export async function computePlatformLiability(
  supabase: SupabaseClient,
  options?: {
    operationalBufferDesoNanos?: bigint;     // default 500_000_000n (0.5 DESO)
    desoUsdRate?: number;                    // optional override (testability)
  }
): Promise<TreasurySnapshot>
```

The module:
1. Fetches wallet balances on-chain (DeSo `get-users-stateless` for DESO,
   `get-hodlers-for-public-key` reverse-query for creator coins per HRV-9
   pattern that worked).
2. Reads `positions`, `position_payouts`, `holder_rewards`, `creators`
   from Supabase.
3. Fetches DESO/USD rate via existing `fetchDesoUsdRate`.
4. For each unique pending-holder-reward token slug, fetches the current
   creator coin price via existing `getCreatorCoinData` (or equivalent
   already in `lib/deso/api.ts`).
5. Computes liability + extractable + status per asset.
6. Returns the snapshot.

All conversions:
- `usdToDesoNanos(usd, rate)` → existing helper
- `usdToCreatorCoinNanos(usd, coinPriceUsd)` → new helper, computed inline

Errors are non-fatal where possible: if a single coin's price fetch fails,
we mark its status as 'unknown' and add a warning, but don't fail the whole
snapshot.

### `app/api/admin/treasury/route.ts` — endpoint

```typescript
GET /api/admin/treasury
  Headers: Authorization: Bearer <admin_password>
  // OR
  Body: { adminPassword?: string, desoPublicKey?: string }

Response 200:
  {
    ok: true,
    snapshot: TreasurySnapshot
  }

Response 401:
  { ok: false, error: 'unauthorized' }

Response 500:
  { ok: false, error: 'internal', message: string }
```

Auth: `isAdminAuthorized` from `lib/admin/auth.ts` (existing pattern).
Service-role Supabase client for the read.

### Why GET, not POST

Read-only operation. Idempotent. Allows curl-friendly inspection.
Auth via Bearer header for GET.

---

## Test plan

### `liability.test.ts` (unit tests)

| # | Test | Asserts |
|---|------|---------|
| 1 | Empty state (no positions, no rewards, no escrow) | liability=0, extractable=walletBalance−buffer |
| 2 | Single open YES position, $1 cost, 1.0 share | DESO liability includes 1 share × $1 = $1 → DESO |
| 3 | Multiple open positions across markets | Sum is correct |
| 4 | Pending position_payouts | Adds to DESO liability |
| 5 | Creator escrow ($0.005 × 2 creators) | $0.010 added to DESO liability |
| 6 | Pending holder_rewards on $bitcoin only | Coin liability for bitcoin only, others 0 |
| 7 | Pending holder_rewards on multiple coins | Per-coin breakdown correct |
| 8 | Extractable negative case | status='insolvent', warning emitted |
| 9 | Operational buffer applied (DESO) | extractable = balance − liability − buffer |
| 10 | USD→DESO uses passed-in rate | Mock rate, assert math |
| 11 | USD→coin uses passed-in price | Mock price, assert math |

### `treasury.test.ts` (route integration)

| # | Test | Asserts |
|---|------|---------|
| 1 | No auth → 401 | |
| 2 | Wrong password → 401 | |
| 3 | Valid admin password → 200 + snapshot shape | All required fields present |
| 4 | Liability computed end-to-end | Mocked supabase + chain returns produce expected snapshot |

---

## Edge cases & decisions

### Open positions on RESOLVED markets (status='settled')
These should NOT be in liability — they're already settled. The query
filters `WHERE positions.status = 'open'` only.

### Position_payouts with status='claimed' or 'failed'
Already paid or definitively failed. NOT in liability. The query filters
`WHERE claim_status IN ('pending','in_flight')`.

### Creator escrow with $0
Filtered out at SQL level for query efficiency.

### Holder rewards rows with NULL claim_status
Treated as `'pending'` — these are accrued-but-not-yet-claim-attempted.
The `holder_rewards.status` column (not `claim_status`) controls this.

### Coins with no holders / 0 supply
Not expected (every trade auto-buys), but handled: if price fetch returns
0 or null, status='unknown', warning emitted.

### Stale data
DeSo node indexer has 5-15 min lag on `get-hodlers-for-public-key`
(known per memory). The dashboard caveats this with `asOf` and
documents the freshness expectation.

---

## Out of scope (Phase 2 / Stream 3)

- Admin UI page (`app/admin/treasury/page.tsx`)
- Auto-refresh on UI
- Time-series storage of snapshots
- Alerts when status='insolvent' or 'tight'
- Sweep-to-cold-wallet UI/script
- Operational buffer tuning based on observed claim rate
- Multi-asset position payouts (currently DESO-only)

---

## Decision log

| # | Decision | Why |
|---|----------|-----|
| 1 | Use worst-case for open position liability, not probability-weighted | Solvency calc must answer "could platform pay if everything wins" |
| 2 | Operational buffer 0.5 DESO, 0 creator coins | Conservative starting values; tune later |
| 3 | Read-only Phase 1, no sweep button | Sweep mechanics belong in Stream 3 (touches platform seed) |
| 4 | GET endpoint with Bearer auth, not POST | Read-only operation, idempotent |
| 5 | Per-coin price fetched in real-time, not cached | Phase 1 simplicity; revisit if rate-limiting hits |
| 6 | Liability includes settled-but-unclaimed payouts as concrete obligations | They're already-promised money |
| 7 | $CalderaPlatform vestigial founder reward ignored | Cannot be recovered, no purpose |

---

## Acceptance criteria

- ✅ `lib/finance/liability.ts` exports `computePlatformLiability`
- ✅ Unit tests cover the 11 scenarios above (all pass)
- ✅ `GET /api/admin/treasury` returns `TreasurySnapshot` with valid auth
- ✅ Returns 401 without valid auth
- ✅ Integration tests cover the 4 scenarios above (all pass)
- ✅ npm run build green; tsc clean (modulo pre-existing claim-winnings.test.ts errors)
- ✅ Manual prod test: `curl https://www.caldera.market/api/admin/treasury -H "Authorization: Bearer caldera-admin-2026"` returns valid snapshot showing realistic numbers (~7.26 DESO balance, ~9 DESO open-position worst-case liability, status='insolvent' as expected)
