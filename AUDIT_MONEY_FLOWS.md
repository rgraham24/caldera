# Caldera Money Flows — Architecture & Audit

**Status:** Living document. Updated as fixes land.
**Branch of origin:** `docs/money-flows-audit` cut from `main` on 2026-04-23.
**Last updated:** 2026-04-23.

---

## Purpose

This document is the single source of truth for how money moves through
Caldera, what's currently broken, and how we fix it.

It exists because a session-long architecture audit (2026-04-23) surfaced
critical gaps in 4 of 5 user-money paths. Fixing them properly requires a
shared mental model across future work — including work done by new
collaborators, by future-Robert, or by LLM assistants in future sessions
who have no memory of the original audit.

### What this doc is

- An architectural map of every path where user money moves
- A catalogue of known-broken behavior with severity, evidence, and fixes
- The reference for the "Liability-Ledger + On-Chain Claim" pattern we
  apply across every money path
- A living document updated as each fix lands (see Changelog section)

### What this doc is not

- A replacement for `DECISIONS.md` (tokenomics + product decisions)
- A replacement for `CLAUDE.md` (day-to-day engineering context)
- A marketing or user-facing document

### How to update this doc

Any branch that touches a money-flow path **must** update this doc:

1. If behavior changed → update the "Current behavior" section of the
   affected path
2. If a critical finding was resolved → move it to the Changelog with
   the fixing commit hash
3. If a new finding was surfaced → add it with severity tag, evidence
   (file:line refs), and proposed fix

The doc is part of the review criteria for every money-related PR.

---

## Architecture Overview

### Custodial platform wallet model

Caldera operates a **custodial prediction market** backed by a single
DeSo wallet (the "platform wallet"):

- Public key: `BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7`
- Seed: `DESO_PLATFORM_SEED` environment variable (Vercel env + local
  `.env.local`, never in source)
- Purpose: holds all user-deposited DESO, pays out winners, executes
  on-chain operations on behalf of the platform (auto-buys, creator
  escrow releases, holder reward distributions)

Positions and balances are **not** on-chain objects. They are rows in
Supabase. The platform wallet is the single custody boundary between
Caldera and the DeSo blockchain.

### Money flow at a glance

```
                        DeSo Blockchain
                              ▲
                              │
                ┌─────────────┼─────────────┐
                │    Platform Wallet        │
                │   BC1YLjFke...            │
                └─────────────┬─────────────┘
                              │
         ┌────────────┬───────┴────────┬────────────┐
         │            │                │            │
       Buy         Sell           Resolution    Holder Claim
     (in-flow)   (out-flow)        (out-flow)    (out-flow)
       User →     Platform →      Platform →    Platform →
     Platform     User             Winners       Holders
                              │
                              ▼
                       Creator Claim
                       Platform → Creator
                       (escrow release)
```

### Two ledger models in Caldera

Caldera uses two distinct ledger patterns. Understanding the difference
is essential for reasoning about the codebase.

#### 1. Positions ledger (mutable state)

- Tables: `positions`, `markets`, `trades`, `users`
- Represents: current state of who owns what
- Mutation: rows are created, updated, and status-transitioned freely
- Example: selling reduces `positions.quantity`; resolution sets
  `positions.status='settled'`

#### 2. Money-movement ledger (append-only event log)

- Tables: `fee_earnings`, `holder_rewards`, (future: `position_payouts`,
  `creator_claim_payouts`)
- Represents: every individual accrual and on-chain settlement
- Mutation: rows are INSERTed once, then only status-transitioned via
  UPDATE (`pending` → `paid` or `failed`). **Never deleted or zeroed.**
- Example: a holder reward row stays in the DB forever; when the holder
  claims, the row's status changes but the amount and original
  attribution are preserved.

The money-movement ledger is the audit trail. If we want to answer
"what did we owe holder X at any given time?" — we sum pending rows
for that holder. If we want to know "did user Y actually receive their
winnings?" — we look for `status='paid'` with a `tx_hash`.

### The "Liability-Ledger + On-Chain Claim" pattern

This is the pattern we apply **everywhere** money moves:

```
1. Accrual:
   INSERT a row in the money-movement ledger with:
     status = 'pending'
     amount_usd (authoritative)
     amount_deso_nanos + deso_usd_rate_at_accrual (snapshot)
     recipient identifier
     context refs (trade_id, market_id, etc.)

2. Trigger:
   Either scheduled (e.g. automatic payouts on resolution — NOT our
   choice; we prefer pull) or user action (claim button).

3. Pre-flight:
   - Verify solvency (platform wallet ≥ amount)
   - Check idempotency (row not already 'paid')
   - Acquire lock if concurrency matters

4. On-chain settlement:
   - Build DeSo transaction (send-deso or transfer-creator-coin)
   - Sign with platform seed
   - Submit, get tx_hash

5. Write-back:
   - Success → UPDATE status='paid', tx_hash=<hash>, paid_at=NOW()
   - Failure → UPDATE status='failed', failed_reason=<msg>

6. Never zero, never delete:
   The accrual row stays forever. Status transitions carry the history.
```

This pattern is already implemented correctly for `fee_earnings.auto_buy_pool`
rows (see `lib/deso/buyback.ts`). It is the template for fixing every
other money path.

---

## Trust Boundaries

A trust boundary is a line between code we control and code we don't.
Every trust boundary needs explicit verification — anything coming from
the other side must be validated before being used.

### Server-verified (trusted)

Facts the server can establish on its own, without trusting the client:

- Platform wallet public key (from env)
- Platform wallet seed (from env, used for signing)
- Supabase service role key (from env)
- DB state at read time (via service-role reads)
- System time
- On-chain state at query time (via DeSo API queries — slow, but
  authoritative)

### Client-trusted (needs verification)

Facts the client sends in a request. **These must all be verified
server-side before being used:**

- Any `desoPublicKey` in a request body → must be verified via auth
  session matching the wallet that signed into the DeSo Identity flow
- Any `txnHash` → must be verified against the DeSo blockchain (sender,
  recipient, amount, tx not already consumed)
- Any `amount` representing a financial value → must match the on-chain
  evidence; never trusted alone
- Any `positionId`, `marketId` → must be verified to belong to the
  authenticated user before operations
- Any claim code → must be verified against the DB and ownership
  verified (social proof, wallet ownership, etc.)

### On-chain-verified (cryptographically trustworthy)

Facts we can read from the DeSo blockchain directly. These are the
strongest form of verification:

- A transaction's sender, recipient, and amount (via DeSo API
  `get-transaction` or equivalent)
- Creator coin holdings (via `get-hodlers-for-public-key`)
- Account balances (via `get-users-stateless`)

### Current state of verification in Caldera

As of 2026-04-23, **Caldera is under-verifying at nearly every trust
boundary.** Specific findings are documented in the per-path sections
below. The audit's central observation: the current trade route
(`app/api/trades/route.ts`) trusts almost every client-supplied value
without verification, creating multiple free-money and griefing attack
surfaces.

Fixing this is the core purpose of the planned rebuild work.

---

<!-- The sections below will be added in subsequent commits to this branch. -->

## Path 1 — Buy Flow

### What it should do

A user deposits DESO into Caldera to take a position in a prediction market. After this flow:

- User's DESO has moved on-chain from their wallet to the platform wallet
- A `trades` row records the event with authoritative metadata
- A `positions` row reflects the user's new holding
- Four `fee_earnings` rows capture the 2.5% fee split (platform / holder rewards / auto-buy / creator)
- If the market's relevant creator is unclaimed, `creators.unclaimed_earnings_escrow` is incremented atomically
- Background async: per-holder reward snapshots + on-chain auto-buy execute fire-and-forget

### Current flow (2026-04-23)

```
User clicks "Buy YES $1" in TradeTicket
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ CLIENT (components/markets/TradeTicket.tsx)         │
│ 1. fetch DeSo USD exchange rate                     │
│ 2. convert $amount → nanos                          │
│ 3. sendDesoPayment(userKey, PLATFORM_WALLET, nanos) │
│    → DeSo Identity popup                            │
│    → user signs BasicTransfer                       │
│    → tx submitted on-chain                          │
│    → returns txnHashHex                             │
│ 4. POST /api/trades { marketId, side, amount,       │
│    txnHash, desoPublicKey }                         │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ SERVER (app/api/trades/route.ts POST)               │
│ 1. Zod parse body (lines ~25-40)                    │
│ 2. Check desoPublicKey presence — 401 if missing    │
│    ⚠ NO verification that user owns that wallet     │
│ 3. Look up/create user by deso_public_key           │
│ 4. Load market, run AMM quote                       │
│ 5. Update market AMM pools (no tx yet)              │
│ 6. Insert price_history row                         │
│ 7. Insert trades row with tx_hash=<client-supplied> │
│    ⚠ NO verification the txnHash is real            │
│    ⚠ NO uniqueness check on tx_hash                 │
│ 8. Upsert positions row (not in same tx as 7)       │
│    ⚠ Partial failure here = trade without position  │
│ 9. Insert 4 fee_earnings rows (not in same tx)      │
│    ⚠ Partial failure = trade without fee records    │
│ 10. Escrow RPC (if unclaimed creator) — atomic      │
│ 11. Fire-and-forget: snapshotHolders(...)           │
│ 12. Fire-and-forget: executeTokenBuyback(...)       │
│     ⚠ Spends real platform DESO even on             │
│     fraudulent trades (see BUY-8)                   │
│ 13. Return success with trade.id                    │
└─────────────────────────────────────────────────────┘
         │
         ▼
   Client shows "You're in!" confirmation
```

### Schema touched

- `users` (read or insert)
- `markets` (update: AMM pool fields)
- `price_history` (insert)
- `trades` (insert)
- `positions` (upsert)
- `fee_earnings` (×4 inserts)
- `creators.unclaimed_earnings_escrow` (atomic increment via RPC, when applicable)
- `holder_rewards` (async inserts × N holders, via snapshotHolders)
- `fee_earnings.auto_buy_pool` row later gets UPDATE status='paid' or 'failed' by executeTokenBuyback

### Trust boundaries crossed

- **Client-trusted `desoPublicKey`** — accepted without verifying session/signature proves ownership
- **Client-trusted `amount`** — accepted without cross-check against on-chain evidence
- **Client-trusted `txnHash`** — accepted without querying the blockchain
- **No rate limiting** at HTTP layer or user-level

All of these are under-verified per the Trust Boundaries section.

### 🚨 Critical findings

#### BUY-1: Identity is client-claimed, never verified (P0)

- **Evidence:** `app/api/trades/route.ts` — request schema has `desoPublicKey: z.string().optional()`. Only check is presence (401 if missing). No getSession, no auth middleware, no signature verification.
- **Impact:** Anyone can POST `/api/trades` with any DeSo public key. They can create positions under another user's account, or sell another user's existing positions (in the sell route, which has the same identity gap).
- **Severity:** P0 launch blocker. Direct theft surface (via sell), ledger corruption surface (via buy).
- **Fix:** Add auth middleware that validates a session token or signed message linking the request to the `desoPublicKey` holder. Reject all requests where the claimed key can't be cryptographically tied to the requester. Depends on choice of auth pattern — see Open Questions.

#### BUY-2: Free positions possible (amount not verified) (P0)

- **Evidence:** `amount: z.number().positive()` in the request schema is the only check. Server never queries DeSo to verify that `txnHash` transferred `amount` worth of DESO to the platform wallet.
- **Impact:** Attacker POSTs `{ amount: 1000, txnHash: null }` → server records a $1000 trade, creates a position, writes fee rows, fires on-chain auto-buy. No DESO ever entered the platform wallet. Platform loses real DESO on the auto-buy for fake trades, ledger is polluted with non-backed positions.
- **Severity:** P0 launch blocker. Direct free-money glitch. Draining attack.
- **Fix:** Before any DB writes, query the DeSo blockchain for the tx by `txnHash`. Verify: sender matches verified `desoPublicKey`, recipient is `PLATFORM_WALLET`, amount is ≥ claimed `amount` (in nanos, with appropriate rate conversion). Reject on any mismatch. Requires `lib/deso/verifyTx.ts` helper (Phase 2 primitive).

#### BUY-3: No replay protection on tx_hash (P0)

- **Evidence:** No UNIQUE constraint on `trades.tx_hash`. Server does not query for existing rows with the submitted `txnHash` before insert. 12 trades currently have a tx_hash, 0 duplicates — but only because no one has replayed yet.
- **Impact:** Attacker sends a real $1 DESO transfer, gets the hash, then POSTs `/api/trades` 100 times with that same hash and different market IDs. Gets 100 positions for 1 DESO. Same attack works with any successful on-chain send.
- **Severity:** P0 launch blocker. Pairs with BUY-2 for a combined free-money attack.
- **Fix:** Add UNIQUE constraint on `trades.tx_hash` in a migration. Server should also do an explicit check + return a meaningful error. A tx_hash of NULL is also disallowed for new rows post-fix — historical NULL rows documented in BUY-7.

#### BUY-4: No atomicity across trade/position/fee inserts (P0)

- **Evidence:** Trade insert, position upsert, and 4 fee_earnings inserts are sequential Supabase client calls with no BEGIN/COMMIT or RPC wrapping them. Each can succeed or fail independently.
- **Impact:** Partial DB failure (connection drop, timeout, any constraint error) mid-sequence leaves inconsistent state:
  - Trade row but no position → user "traded" but owns nothing
  - Trade + position but no fee_earnings → platform's ledger is missing fee accrual
  - Trade + position + 3 fees but 4th failed → fee split doesn't sum to total
- **Severity:** P0 launch blocker. Every partial failure is a ticketing nightmare. No way to detect or reconcile without manual audit.
- **Fix:** Wrap the core write sequence in a Postgres stored procedure (via Supabase RPC) that runs atomically. Outputs the trade ID only after all writes succeed. Fire-and-forget paths (snapshotHolders, executeTokenBuyback) stay outside the transaction since they're idempotent and don't affect trade correctness.

#### BUY-5: No rate limiting, no auth middleware at the edge (P0)

- **Evidence:** No Next.js `middleware.ts` at repo root. No rate limiting on `/api/trades`. Rate limiting exists only on `autonomous-cycle` and `markets/[id]/news`.
- **Impact:** Even after BUY-1/2/3/4 are fixed, there's no defense-in-depth against a high-velocity attack. An authenticated user with a legitimate session can still rapidly hit the trade endpoint.
- **Severity:** P0 launch blocker. Required defense layer regardless of other fixes.
- **Fix:** Add Next.js edge middleware with session verification + per-user rate limit (likely 30–60 req/min for the trade endpoint). Supabase auth can be a source of truth for the rate-limit key.

### 🟡 Concerns

#### BUY-6: No upper bound on `amount`

- **Evidence:** `amount: z.number().positive()` with no max.
- **Impact:** Low (combined with BUY-2 fix, this is belt-and-suspenders). A market with $10M trades is at minimum suspicious and deserves extra friction.
- **Fix:** Add a reasonable max (e.g., `amount: z.number().positive().max(10_000)`) to the schema, adjustable via env for admin/testing.

#### BUY-7: 5 legacy trades in prod DB with null `tx_hash`

- **Evidence:** Part C of buy flow audit — 5 trade rows, all pre-April-15, all missing `tx_hash`.
- **Impact:** Historical artifacts from an earlier era. Low. But they'll need to be dealt with when we add the NOT NULL constraint post-BUY-3 fix.
- **Fix:** Audit each row: confirm it was a dev/test artifact, delete or flag with a sentinel `tx_hash` value. Document in the migration that does the NOT NULL ALTER.

#### BUY-8: Auto-buy amplifies BUY-2 severity

- **Evidence:** `executeTokenBuyback` (lib/deso/buyback.ts, shipped 2026-04-23) spends platform wallet DESO based on `v2Fees.autoBuy`. Called fire-and-forget from the trade route.
- **Impact:** Before the audit session's Step 3d, the trade route never spent real DESO on auto-buys (legacy code was dead). Now it does. Combined with BUY-2, an attacker forcing fake trades drains platform DESO through legitimate-looking auto-buys.
- **Severity:** P1 (inherits P0 status from BUY-2; independently is P1 because fixing BUY-2 resolves this indirectly).
- **Fix:** None standalone — fixing BUY-2 removes the exposure. Document so we don't roll back BUY-2 without considering this.

### Target behavior (after fixes)

```
POST /api/trades
      │
      ▼
Next.js middleware
  - Extract auth session (proves holder of desoPublicKey)
  - Rate limit check (per authenticated user)
      │
      ▼
Route handler
  1. Zod parse body (with max-amount bound)
  2. Assert session.desoPublicKey === body.desoPublicKey
  3. verifyDesoTransfer(txnHash, desoPublicKey,
     PLATFORM_WALLET, amountNanos) → on-chain check
  4. Check tx_hash not already in trades (unique)
  5. BEGIN TX (via Supabase RPC atomic_record_trade):
       INSERT trade
       UPSERT position
       INSERT fee_earnings × 4
       increment_unclaimed_escrow (if applicable)
     COMMIT (all-or-nothing)
  6. Fire-and-forget: snapshotHolders
  7. Fire-and-forget: executeTokenBuyback
  8. Return trade.id
```

### Dependencies (what needs to exist before fixes land)

- Phase 2 primitive: `lib/deso/verifyTx.ts` (verifies on-chain tx shape)
- Phase 2 primitive: Auth middleware pattern (DB-level session or signed-message)
- Phase 2 primitive: Supabase RPC function for atomic trade recording
- Phase 2 primitive: Rate limiter pattern (Upstash Redis or similar)
- DB migrations: UNIQUE on `trades.tx_hash`, NOT NULL after BUY-7 cleanup, max-amount config

---

## Path 2 — Sell Flow

### What it should do

A user closes or reduces an existing position to exit the market. After this flow:

- The user's position is reduced (partial sell) or closed (full sell) by exactly the quantity they chose to sell
- A `trades` row records the event with side='sell'
- DESO from the platform wallet is sent on-chain to the user's wallet for the AMM-quoted return amount
- The on-chain tx hash is persisted so the payout is verifiable later
- No fees are taken on sells (per tokenomics locked 2026-04-21)

### Current flow (2026-04-23)

```
User clicks "Sell" with a quantity in TradeTicket
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ CLIENT (components/markets/TradeTicket.tsx)         │
│ NO DeSo Identity popup. NO user-side on-chain tx.   │
│ 1. POST /api/trades/sell { marketId, side,          │
│    quantity, desoPublicKey }                        │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ SERVER (app/api/trades/sell/route.ts POST)          │
│ 1. Parse request, look up user via desoPublicKey    │
│    ⚠ NO verification the user owns that wallet      │
│ 2. Load user's open position                        │
│ 3. Compute AMM return quote                         │
│ 4. UPDATE positions:                                │
│    - full sell → status='closed'                    │
│    - partial sell → reduce quantity                 │
│    ⚠ Position closed/reduced BEFORE payout attempt  │
│ 5. INSERT trades row with side='sell', fees=0       │
│ 6. TRY to pay user on-chain:                        │
│    - POST node.deso.org /api/v0/send-deso          │
│       ⚠ Different endpoint than buy route           │
│         (api.deso.org). Inconsistent.               │
│    - Get unsigned TransactionHex                    │
│    - signTransactionWithSeed(txHex, platformSeed)   │
│    - Submit signed tx                               │
│    - Get payoutTxnHash                              │
│    ⚠ payoutTxnHash is NEVER persisted to any table  │
│    ⚠ Whole payout block wrapped in try/catch —      │
│      failures are swallowed, sell still returns     │
│      success response to client                     │
│ 7. Return success                                   │
└─────────────────────────────────────────────────────┘
         │
         ▼
   Client shows "sold!" success — even if DESO never arrived
```

### Schema touched

- `users` (read)
- `markets` (read)
- `positions` (read, then update × 2 paths: close or partial)
- `trades` (insert, all fee_* fields = 0)

Notably NOT touched:
- No `payout_tx_hash` column exists anywhere
- No `payout_status` tracking
- No `fee_earnings` rows (sells are 0-fee per 2026-04-21 tokenomics)

### Trust boundaries crossed

- **Client-trusted `desoPublicKey`** — same gap as BUY-1
- **Client-trusted `quantity`** — validated against the user's position, but only after trusting the claim that the position belongs to the requester
- **Server-side DeSo tx signed + submitted** — platform wallet seed used; failure silently swallowed

### 🚨 Critical findings

#### SELL-1: Identity is client-claimed (inherits BUY-1) (P0)

- **Evidence:** `app/api/trades/sell/route.ts` — same `desoPublicKey` from request body pattern as `/api/trades`. No session/signature verification.
- **Impact:** Anyone can POST `/api/trades/sell` with any user's `desoPublicKey` and close that user's positions. Payout goes to that user's wallet (not the attacker's) — but the attacker has now forcibly liquidated someone's position, potentially at unfavorable AMM pricing. Griefing attack on par with theft in user experience.
- **Severity:** P0 launch blocker. Fix shares with BUY-1 (single auth middleware serves both routes).
- **Fix:** Auth middleware that verifies `desoPublicKey` matches the authenticated session. Same fix as BUY-1.
- **Status: ✅ RESOLVED (2026-04-24, P2-1)** commit `410a506` (same commit as BUY-1).
  Identity now comes from the middleware-verified HTTP-only signed session cookie.
  The sell route calls `getAuthenticatedUser(req)` which reads the cookie-stamped
  `x-deso-pubkey` header — never the request body. Body-supplied `desoPublicKey`
  is ignored. P3-2.3 (commit `5ca9de4`) further wired this with service-role client
  and Zod schema validation.

#### SELL-2: Payout failure is silently swallowed (P0)

- **Evidence:** `app/api/trades/sell/route.ts` — the entire on-chain payout block is wrapped in a try/catch. Catch branch logs but does NOT propagate failure. Function returns success to client regardless of payout outcome.
- **Impact:** User with 7 shares worth $3.90 clicks "sell all". Server:
    1. Closes position (status='closed')
    2. Inserts sell trade row
    3. Tries to send DESO — fails (platform wallet out of DESO, DeSo API 500, any error)
    4. Returns success to client
    User loses position AND gets no payout. No way to automatically recover — position is gone from the DB.
- **Severity:** P0 launch blocker. Worse failure mode than buy's atomicity gap — user loses both sides.
- **Fix:** Two-part:
    1. Don't close the position until payout confirmed (see Target behavior below)
    2. Never return success when payout failed — return 500 with a support-ticket-able error code. Add retry mechanism for stuck payouts (Phase 4 reconciliation tooling).
- **Status: ✅ RESOLVED (2026-04-26, P3-2)** commits `cb42018` (schema), `5ca9de4` (route).
  Failed `transferDeso` now marks `trades.payout_status = 'failed'` with reason and
  returns HTTP 500. The position is NEVER transitioned (closed or reduced) without
  on-chain confirmation. Position changes happen exclusively inside the `mark_sell_complete`
  SETTLE RPC, which runs AFTER `transferDeso` confirms success. State machine:
  `payout_status`: pending → paid | failed.

#### SELL-3: `payout_tx_hash` is not persisted (P0)

- **Evidence:** The DeSo submit-transaction response contains a `TxnHashHex` (the on-chain tx hash of the platform's payout). This value is used only in the local function scope and is never written to any DB table. No `payout_tx_hash` column exists on `trades` or anywhere else.
- **Impact:** Zero on-chain verifiability for any sell payout. Cannot answer "did user X actually receive their sell proceeds?" without digging through Vercel logs (which rotate). Parallel to the `fee_earnings.tx_hash` gap we fixed in Step 3d.1 for auto-buys — sell flow is missing the same feature.
- **Severity:** P0 launch blocker. Even if SELL-2 is fixed, without persisting tx_hash we can't audit sell payouts.
- **Fix:** Add `payout_tx_hash`, `payout_status`, `payout_at`, `payout_failed_reason` columns to `trades` via migration. On successful DeSo send, write `payout_tx_hash` and status='paid'. On failure, write status='failed' with reason.
- **Status: ✅ RESOLVED (2026-04-26, P3-2)** commit `cb42018` (P3-2.2 migration).
  New columns `payout_tx_hash` (TEXT), `payout_status` (TEXT), `payout_at` (TIMESTAMPTZ),
  `payout_failed_reason` (TEXT) added to `trades` — all nullable for back-compat with
  existing buy rows. `payout_tx_hash` is written by the `mark_sell_complete` RPC during
  SETTLE, enabling full reconciliation between platform DESO outflows and the trade ledger.

### 🟡 Concerns

#### SELL-4: Position update happens BEFORE payment attempt

- **Evidence:** Sequence in the sell route: positions update → trades insert → DeSo payout (tried).
- **Impact:** The wrong order for this flow. If the payout fails, the position is already closed — user has no retry option without manual intervention.
- **Fix:** Correct order (see Target behavior): insert sell trade with payout_status='pending' → attempt on-chain payout → on success, close position + update trade; on failure, update trade to 'failed', leave position open.
- **Note:** This fix is entwined with SELL-2's fix; they land together in the same branch.
- **Status: ✅ RESOLVED (2026-04-26, P3-2)** commit `5ca9de4` (P3-2.3 route rewrite).
  Correct order enforced: (1) INSERT trade with `payout_status='pending'` — no position
  change yet; (2) `transferDeso` on-chain send; (3) on success, `mark_sell_complete` RPC
  atomically marks trade `paid` AND closes/reduces the position. A failed transfer marks
  the trade `failed` and leaves the position fully intact — user can retry with a fresh
  `idempotencyKey`.

#### SELL-5: No sell fees — correct per tokenomics, worth documenting

- **Evidence:** Sell route inserts `trades` rows with all `fee_*` fields set to 0.
- **Impact:** None — this is the correct behavior per 2026-04-21 tokenomics lock-in (sells are 0% fee). But the code actively writes zeroes rather than omitting the columns, which is a slight readability issue.
- **Fix:** Not a fix — verify the intent by making the zero-writes explicit with a comment referencing DECISIONS.md. No behavior change.
- **Note (2026-04-26):** Confirmed correct per locked tokenomics (DECISIONS.md 2026-04-21):
  sells are 0% fee on all markets. Buys carry the 2.5% split. The P3-2.3 route
  continues to write fee fields as 0. No action required.

#### SELL-6: 10,000 nanos minimum floor (inconsistent with buy's 1000)

- **Evidence:** Sell route floors the computed payout nanos at 10000. Buy route / `lib/deso/buyback.ts` uses a floor of 1000.
- **Impact:** Minor. A user selling a position worth < ~$0.000047 wouldn't receive a payout. Probably never happens in real usage.
- **Fix:** Decide on a canonical floor (the 1000 nanos value from DeSo's native floor is the right choice) and apply consistently across both routes. Add as a shared constant in `lib/deso/transaction.ts` or similar.
- **Status: ✅ RESOLVED (2026-04-26, P3-2)** commit `5ca9de4` (P3-2.3 route rewrite).
  Sell route now uses `MIN_PAYOUT_NANOS = BigInt(1_000)` — matches the floor used in
  `lib/deso/buyback.ts`. Inconsistent 10,000-nano threshold eliminated.

#### SELL-7: Uses `node.deso.org` not `api.deso.org`

- **Evidence:** Sell route's on-chain calls go to `node.deso.org`; buy's go to `api.deso.org`.
- **Impact:** Usually harmless — both resolve to DeSo's infrastructure. But if one's load-balanced differently or one gets deprecated, only one route breaks. Maintenance hazard.
- **Fix:** Canonicalize on `api.deso.org` via the shared `DESO_API_BASE` constant from `lib/deso/rate.ts`. Already done for new code; sell route needs migrating.
- **Status: ✅ RESOLVED (2026-04-26, P3-2)** commit `5ca9de4` (P3-2.3 route rewrite).
  Entire inline send-deso/submit-transaction block removed. Replaced with
  `lib/deso/transferDeso.ts` (the P3-5.3 primitive), which uses canonical `api.deso.org`
  throughout. No more `node.deso.org` references in the sell path.

#### SELL-8: Unused fields on positions table

- **Evidence:** Positions table has `deso_staked_nanos` and `txn_hash` columns that are always null. Never written. Possibly dead from an earlier architecture.
- **Impact:** None functionally. Schema clutter. Could also be confusing — "is this meant to be populated?"
- **Fix:** Either drop in a migration or document in a comment on the table what they're for / why they exist. Low priority.
- **Note (2026-04-26):** Confirmed unused by any active code path. Column drops deferred
  to a separate hygiene migration — out of P3-2 scope. Tracked for a future hygiene
  branch alongside `trades.coin_holder_pool_amount` and the `coin_holder_distributions`
  table drops.

### Target behavior (after fixes)

```
POST /api/trades/sell
      │
      ▼
Next.js middleware
  - Extract auth session (proves holder of desoPublicKey)
  - Rate limit check
      │
      ▼
Route handler
  1. Zod parse body
  2. Assert session.desoPublicKey === body.desoPublicKey
  3. Load user's position — verify ownership + sufficient quantity
  4. Compute AMM quote
  5. BEGIN TX (via atomic_open_sell_trade RPC):
       INSERT trades row with:
         side='sell'
         payout_status='pending'
         payout_tx_hash=null
       (position NOT modified yet)
     COMMIT
  6. Attempt on-chain payout:
     - build send-deso tx via api.deso.org (canonical)
     - signAndSubmit via lib/deso/transaction.ts
     - if success:
         BEGIN TX (atomic_settle_sell_trade RPC):
           UPDATE trades SET
             payout_status='paid', payout_tx_hash, payout_at
           UPDATE positions (close or reduce)
         COMMIT
     - if failure:
         UPDATE trades SET
           payout_status='failed', payout_failed_reason
         (position untouched — user can retry)
  7. Return response reflecting actual payout state
      - 200 + position state on success
      - 500 + correlation ID on failure; reconciliation picks up the
        pending trade and can retry or escalate
```

### Dependencies (what needs to exist before fixes land)

- Phase 2 primitive: Auth middleware (shared with BUY-1)
- Phase 2 primitive: `lib/deso/transaction.ts` already exists (shipped in 3d.2b)
- Phase 2 primitive: Atomic sell-trade RPCs (new Supabase functions)
- DB migration: Add `payout_status`, `payout_tx_hash`, `payout_at`, `payout_failed_reason` to `trades`
- DB migration: Index on `(payout_status, payout_at)` for reconciliation queries
- Phase 4: Reconciliation job that finds `payout_status='pending'` rows older than N minutes and surfaces for retry/admin

---

## Path 3 — Market Resolution & Winner Payout

### What it should do

A market reaches its close time or a decisive event, an outcome is
determined, and the positions are settled accordingly. After this flow:

- Market is marked `status='resolved'` with an authoritative outcome
- Every position on the market has `status='settled'` with `realized_pnl`
  reflecting win/loss
- Winners have a way to receive their payout in DESO
- Losers' positions are closed at zero payout (their stake remains in
  the AMM/platform wallet, offsetting winner payouts)
- The platform retains the 2.5% fees already collected at buy time

**Payout model (locked 2026-04-23): pull-based claim.** Resolution
settles the ledger. Users click "Claim winnings" to trigger their own
payout. See Target behavior section for details and rationale.

### Current flow (2026-04-23)

Three redundant routes implement the same resolution logic:
- `app/api/admin/resolve-market/route.ts`
- `app/api/markets/[id]/resolve/route.ts`
- `app/api/admin/auto-resolve/route.ts`

Plus a cron scheduler at `app/api/cron/resolve-crypto-markets/route.ts`
that invokes one of the above.

All three routes follow the same pattern:

```
Admin or cron invokes a resolution route
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ SERVER (one of three resolution routes)             │
│ 1. markets.update({                                 │
│      status: 'resolved',                            │
│      resolution_outcome,                            │
│      resolved_at,                                   │
│    })                                               │
│ 2. Load positions WHERE market_id = X AND status =  │
│    'open'                                           │
│ 3. For each position:                               │
│    realizedPnl = isWinner                           │
│      ? quantity * 1.0 - total_cost                  │
│      : -total_cost                                  │
│ 4. positions.update({                               │
│      status: 'settled',                             │
│      realized_pnl,                                  │
│    })                                               │
│ 5. Insert market_resolutions row                    │
│ [STOP — no DESO send anywhere]                      │
└─────────────────────────────────────────────────────┘
         │
         ▼
   Market and positions are in 'resolved' / 'settled' state
   Winners see a positive realized_pnl in the UI
   ⚠ No DESO has moved. No payout mechanism exists.
```

**The DB says winners have earned money. The platform wallet still
holds all the DESO. There is no code path to bridge the two.**

### Schema touched

- `markets` (update: status, resolution_outcome, resolved_at)
- `positions` (update: status='settled', realized_pnl)
- `market_resolutions` (insert: resolution audit row)

Notably NOT touched:
- No DESO send anywhere in any of the three routes
- No `claim_status` on positions (doesn't exist)
- No ledger row for payout owed (doesn't exist)

### Trust boundaries crossed

- **Admin authorization** — the three resolution routes require admin
  auth (the admin password pattern). Not audited in detail here; scoped
  to the Cross-cutting concerns section.
- **Cron-triggered resolution** — crypto markets auto-resolve from a
  scheduled cron. Pulls price data from a public API, resolves based on
  target threshold. Trust boundary: the external price source. Not a
  money-flow issue per se but a market-integrity one. Documented here
  for completeness.

### 🚨 Critical findings

#### RESOLUTION-1: No payout mechanism exists (P0)

- **Evidence:** Audit path 2 output (2026-04-23). Zero matches for
  `send-deso`, `SendDeSo`, `submit-transaction`, or
  `signTransactionWithSeed` in any resolution route. No `realized_pnl`
  consumer anywhere that initiates an on-chain transfer.
- **Impact:** **The core value proposition of a prediction market is
  not implemented.** Users can trade, win, see a positive `realized_pnl`
  in the UI, and never receive DESO. Launching the platform in this
  state would be fraud in effect — taking user funds with no mechanism
  to return them.
- **Severity:** P0 launch blocker. Without this, Caldera is a database
  of unfulfillable promises.
- **Fix:** Build the pull-based claim system described in Target
  behavior below. This is a net-new feature, not a fix to existing
  code. Depends on Phase 2 primitives and a new `position_payouts`
  ledger table.

#### RESOLUTION-2: Three redundant resolution routes (P1)

- **Evidence:** `app/api/admin/resolve-market/route.ts`,
  `app/api/markets/[id]/resolve/route.ts`,
  `app/api/admin/auto-resolve/route.ts` all implement the same
  resolution logic independently.
- **Impact:** Maintenance disaster. Any fix (like adding the claim
  ledger writes) must be made in three places. Drift between the three
  implementations is inevitable and undetectable until a discrepancy
  causes a production incident.
- **Severity:** P1. Not a direct correctness bug, but guarantees future
  correctness bugs.
- **Fix:** Consolidate into a single `resolveMarket(marketId, outcome,
  meta)` function in a shared lib module (e.g.,
  `lib/markets/resolution.ts`). All three routes become thin wrappers
  around it. Cron calls the same function directly. Pure refactor — no
  behavior change — as its own commit before the RESOLUTION-1 fix lands.

#### RESOLUTION-3: No solvency check before resolution (P0)

- **Evidence:** Resolution routes do not query platform wallet DESO
  balance or sum aggregate winning realized_pnl before marking the
  market resolved. If the platform wallet cannot cover all winners,
  the DB state still transitions to `settled` — but claims will fail
  when users attempt them.
- **Impact:** Platform wallet underfunding becomes invisible until the
  first winner tries to claim. At that point: either the claim fails
  (graceful but alarming) or drains the wallet leaving other winners
  with nothing (catastrophic).
- **Severity:** P0 launch blocker once RESOLUTION-1 is fixed. Not
  standalone — solvency check belongs in the claim flow itself, per-
  user, because platform wallet balance at claim time is what matters.
- **Fix:** Per-claim solvency check in the claim handler. Before
  building the DeSo send tx: verify platform wallet has ≥ (claim_amount
  + estimated_tx_fee). If not, write the payout row as
  `status='blocked_insolvent'` (new status) and surface to admin
  dashboard. User sees "temporarily unavailable" not silent failure.

### 🟡 Concerns

#### RESOLUTION-4: No dispute mechanism

- **Evidence:** Once an admin or cron resolves a market, there is no
  contestation path. `status='resolved'` is terminal.
- **Impact:** For price-based crypto markets (the current product focus),
  cron resolution against a reliable feed is defensible. For subjective
  markets (sports, politics, streamer events), disputes are normal and
  contentious. Caldera has no design answer for them.
- **Severity:** P2. Not a launch blocker for the crypto-market MVP.
  Becomes important when expanding to subjective markets.
- **Fix:** Future feature. Likely: timed-window challenge period after
  resolution during which users can flag, admin reviews, outcome can be
  amended. Track in product backlog.

#### RESOLUTION-5: Auto-resolution via cron runs without human review

- **Evidence:** `app/api/cron/resolve-crypto-markets/route.ts` is
  invoked by the scheduled Vercel cron (6x/day). Resolves all
  expired crypto markets in one pass using the current resolution logic.
- **Impact:** Any bug in resolution logic gets mass-exercised silently.
  Resolving 100 markets with a subtle pricing error is a worse outcome
  than a human catching 1 bad resolution. Already a concern; will
  amplify once payouts are wired.
- **Severity:** P1. Becomes more severe post-RESOLUTION-1 fix.
- **Fix:** Add a dry-run mode to cron resolution that logs intended
  resolutions without committing. Run weekly as admin dashboard check.
  Consider requiring human confirmation for any market > a threshold
  TVL (e.g., $100).

#### RESOLUTION-6: No "claim my winnings" UI exists

- **Evidence:** Audit path 2 Part F. Zero grep results for user-facing
  claim components on trade positions.
- **Impact:** Even if RESOLUTION-1 is fixed with a pull-based claim
  API, users have no way to discover they've won or trigger the claim
  without a UI.
- **Severity:** P0 (inherits from RESOLUTION-1 — fix lands together).
- **Fix:** New UI components: dashboard widget showing claimable
  positions with "Claim $X" button. Email/push notification when a
  user has claimable amounts. Covered in Phase 3 alongside the API.

### Target behavior (after fixes)

**Two-stage flow: resolve (admin/cron) then claim (user-initiated).**

#### Stage 1 — Resolve (admin or cron, current behavior, cleaned up)

```
Admin (or cron) invokes the consolidated resolveMarket(...)
      │
      ▼
1. BEGIN TX (atomic_resolve_market RPC):
     UPDATE markets SET status='resolved', outcome, resolved_at
     For each open position:
       INSERT position_payouts row:
         position_id, user_id, market_id
         realized_pnl (the amount owed if winner)
         amount_deso_nanos (snapshot at resolution-time rate)
         deso_usd_rate_at_resolution
         claim_status='pending'   ← user has not claimed yet
         claim_tx_hash=null
       UPDATE positions SET status='settled', realized_pnl
     INSERT market_resolutions row
   COMMIT
      │
      ▼
Return with count of payouts written
Winners can now see "You won $X" with a Claim button
Losers' positions are settled; no payout row written
```

#### Stage 2 — Claim (user-initiated, one at a time)

```
User clicks "Claim $X" on a settled winning position
      │
      ▼
POST /api/positions/[id]/claim-winnings
      │
      ▼
Next.js middleware
  - Auth session verification (shared with BUY/SELL auth)
  - Per-user rate limit
      │
      ▼
Route handler
  1. Load position_payouts row for this position
  2. Verify session.desoPublicKey owns the position
  3. Verify claim_status='pending' (idempotency)
  4. Verify platform wallet has ≥ (amount + tx fee estimate)
     - If not: UPDATE to 'blocked_insolvent', return 503
  5. UPDATE claim_status='in_flight' (pessimistic lock)
  6. Build + signAndSubmit send-deso tx
     - Success:
         UPDATE claim_status='paid', claim_tx_hash, paid_at
         Return 200 with tx hash
     - Failure:
         UPDATE claim_status='failed', failed_reason
         Return 500 with correlation ID
```

Per-user atomicity. Independent failures. Solvency protected at
claim time (not resolution time). tx_hash stored for on-chain audit.
Same pattern as `fee_earnings.auto_buy_pool` (see Step 3d.1-3d.3)
and as the holder rewards claim (Path 4).

### Dependencies (what needs to exist before fixes land)

- Phase 2 primitive: Auth middleware (shared with BUY-1, SELL-1)
- Phase 2 primitive: `lib/deso/transaction.ts` already exists
- Phase 2 primitive: Platform wallet solvency check helper
  (`lib/deso/platformWalletHealth.ts` — originally planned for Step
  3d.4; is now needed here too)
- New DB table: `position_payouts` (ledger for win claim accruals)
- New DB migration: `atomic_resolve_market` RPC
- New API route: `POST /api/positions/[id]/claim-winnings`
- New UI: position claim widget + notification
- Consolidation refactor: one canonical `resolveMarket` lib function
  replacing the three route-level implementations

---

## Path 4 — Holder Rewards Claim

### What it should do

Holders of a relevant token (a creator coin like `$bitcoin` or a
category token like `$CalderaSports`) accrue rewards every time a
trade happens on a market tied to that token. This path transfers
those accrued rewards into the holder's DeSo wallet. After this flow:

- Holder's total unclaimed reward balance (sum of `holder_rewards` rows
  with `status='pending'`) is reduced to zero
- Each individual `holder_rewards` row is status-transitioned to
  `'claimed'` with a `tx_hash` reference — rows are NOT deleted
- Platform wallet transfers creator coins (the relevant token) from its
  auto_buy_pool accumulation to the holder's wallet on-chain
- Holder's DeSo wallet shows new creator coin holdings

**Payout model (locked 2026-04-23): creator coin transfer, not DESO.**
Rewards are paid in the actual relevant token, matching the
tokenomics-v2 intent that paired the 0.5% auto-buy slice with the 0.5%
holder rewards slice. The auto-buy accumulates `$bitcoin` in the
platform wallet; the claim distributes that same `$bitcoin` to
holders. See Target behavior for rationale and mechanics.

### Current flow (2026-04-23)

**The claim side does not exist.** Only the accrual side (shipped in
Step 3c, 2026-04-23) is implemented.

Accrual side (implemented, see Step 3c):

```
Trade happens on market tied to relevant token T
         │
         ▼
snapshotHolders (fire-and-forget from trade route)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ lib/fees/holderSnapshot.ts                          │
│ 1. fetchAllHolders(T.deso_public_key) from DeSo     │
│ 2. Filter out issuer (founder reward not a real     │
│    holder)                                          │
│ 3. computeHolderShares (pro-rata, truncate dust)    │
│ 4. For each holder:                                 │
│    INSERT holder_rewards row:                       │
│      holder_deso_public_key                         │
│      token_slug, token_type                         │
│      amount_usd (authoritative)                     │
│      amount_deso_nanos (at accrual DESO rate)       │
│      deso_usd_rate_at_accrual                       │
│      holder_coins_at_accrual,                       │
│      total_coins_at_accrual                         │
│      status='pending'                               │
│      trade_id, market_id                            │
└─────────────────────────────────────────────────────┘
         │
         ▼
   holder_rewards table grows. Rows stay status='pending' forever.
   [No claim mechanism exists. No UI. No API route. Nothing.]
```

Current DB state (preview at 2026-04-23):
- 174 `holder_rewards` rows across 4 test trades
- 100% status='pending'
- Total accrued: $0.00999908 (~1 cent, all from testing)
- Top holder: $0.00464 pending

Marketing copy in `app/terms/page.tsx` and `Footer.tsx` states
"holders must manually claim accrued rewards." **This is a factual
claim about a feature that does not exist.** Legal/compliance exposure
before launch.

### Schema touched (current)

Accrual-only:
- `holder_rewards` (insert ~87 rows per trade)

Not touched (because claim doesn't exist):
- No row ever transitions out of status='pending'
- No tx_hash stored
- No creator-coin transfers happen

### Trust boundaries crossed (current)

Not applicable for the accrual side (no user input at all — trade route
fires snapshot internally). Trust boundaries for the claim side are
documented in Target behavior below.

### 🚨 Critical findings

#### REWARDS-1: Claim mechanism does not exist (P0)

- **Evidence:** Audit path 3 output (2026-04-23). Zero matches in
  `app/` for holder-reward claim routes or UI. No status transition
  from `'pending'` to `'claimed'` anywhere. 174 rows sit pending with
  no destination.
- **Impact:** Rewards accrue forever with no way for users to collect.
  Liability grows with every trade. The "Hold to earn" promise in the
  UI has no mechanism behind it. At any meaningful trade volume, this
  becomes a legal and UX disaster.
- **Severity:** P0 launch blocker. Feature is advertised in site copy
  and not implemented. Must be built before any public launch.
- **Fix:** Build the claim system per Target behavior below. New API
  route, new UI, new `lib/deso/transfer.ts` primitive. Net-new feature,
  not a fix to existing code.
- **Status: ✅ RESOLVED (2026-04-24, P3-4)**
  `POST /api/holder-rewards/claim` (8-gate money path), `PendingRewards`
  UI on /portfolio, `lib/deso/transfer.ts` primitive. Commits:
  6d0a4c2 (route + 15 tests), 67f7856 (frontend).

#### REWARDS-2: Marketing copy promises an undelivered feature (P0)

- **Evidence:** `app/terms/page.tsx` and `Footer.tsx` reference
  "holders must manually claim accrued rewards."
- **Impact:** Undeliverable promise in legal/terms documents.
  Misrepresentation risk if used to attract users without the feature
  existing.
- **Severity:** P0 pre-launch blocker. Either implement the feature
  (preferred, per REWARDS-1 fix) or remove the copy. Do not launch with
  both the copy and no feature.
- **Fix:** Strictly paired with REWARDS-1. When the claim system lands,
  update the copy to match actual behavior. If launch happens before
  the claim is built (not the current plan), remove the copy first.
- **Status: ✅ RESOLVED (2026-04-24, P3-4)**
  Claim system is now live (see REWARDS-1). Copy accurately describes
  delivered behavior. No copy changes needed — terms language ("manually
  claim") matches the pull-based UX shipped in P3-4.5.

#### REWARDS-3: `TransferCreatorCoin` primitive does not exist in codebase (P0)

- **Evidence:** Audit path 3 Part G (2026-04-23). Zero matches for
  `TransferCreatorCoin`, `transfer-creator-coin`, or any creator-coin
  transfer pattern in the codebase.
- **Impact:** The underlying DeSo primitive needed to move creator
  coins from platform wallet to holder wallet is not built. This
  blocks REWARDS-1 and also blocks Path 5 (creator claim) if that
  flow is redesigned to use creator coin transfers.
- **Severity:** P0 infrastructure blocker. Must be built before any
  claim flow.
- **Fix:** Build `lib/deso/transfer.ts` as a Phase 2 primitive:
  `transferCreatorCoin(fromSeed, recipientPublicKey, creatorCoinPublicKey, amountCoinNanos)` → signAndSubmit → return tx_hash.
  Follows the same module pattern as `lib/deso/buyback.ts` (shipped
  Step 3d.2c). Unit-tested input validation; integration-tested on
  preview with real creator coin transfers.

#### REWARDS-4: 5 stale `auto_buy_pool` rows stuck at 'pending' in prod (P1)

- **Evidence:** Audit path 3 Part F. 5 `fee_earnings` rows with
  `recipient_type='auto_buy_pool'` and `status='pending'` from before
  `executeTokenBuyback` was wired (commit 1c77d3e). They'll never
  self-execute because the code that creates them has changed.
- **Impact:** $0.030 of intended-but-not-executed buybacks. Not
  drastic. But demonstrates the "pending forever" failure mode that
  requires reconciliation tooling to detect.
- **Severity:** P1 hygiene.
- **Fix:** Part of Phase 4 reconciliation. A scheduled job finds
  `status='pending'` rows older than N minutes, attempts re-execution
  or marks as permanently failed with a reason. Specific handling for
  these 5 rows: likely safe to mark `status='abandoned'` with reason
  `'pre-v2-code-path'` and move on.

### 🟡 Concerns

#### REWARDS-5: No "accumulated balance" view per holder

- **Evidence:** No API endpoint or SQL view aggregates a holder's
  pending rewards.
- **Impact:** Even when the claim is built, showing a holder "You
  have $X claimable" requires a query that doesn't exist.
- **Fix:** Trivial SQL view (`v_holder_rewards_pending_by_user`) and
  API endpoint (`GET /api/holder-rewards/balance`). Lands with the
  claim UI in Phase 3.
- **Status: ✅ RESOLVED (2026-04-24, P3-4)**
  `v_holder_rewards_pending_by_user` SQL view (P3-4.2, commit 18b510d),
  `GET /api/holder-rewards/balance` (P3-4.3, commit 0d20fc9, 9 tests).

#### REWARDS-6: Claim payment unit requires clear UX

- **Evidence:** Design decision 2026-04-23 — pay in creator coins,
  not DESO. This is correct architecturally but needs clear user
  communication.
- **Impact:** Users must understand "claim $0.005 of $bitcoin rewards"
  means they receive 0.0002 $bitcoin coins (at current price), which
  will show up in their DeSo wallet as a new creator-coin holding
  (not a DESO balance increase).
- **Fix:** UX/copy work in Phase 3. Show both the USD-equivalent and
  the coin quantity they'll receive. Link to DeSo explorer post-claim.

#### REWARDS-7: `amount_creator_coin_nanos` not stored at accrual time

- **Evidence:** `holder_rewards` schema has `amount_usd` and
  `amount_deso_nanos` but no `amount_creator_coin_nanos`. The claim
  payout amount (in creator-coin nanos) will be computed at claim
  time from `amount_usd / current_creator_coin_price`.
- **Impact:** Holders bear creator-coin price fluctuation between
  accrual and claim. If $bitcoin doubles in price between accrual and
  claim, holder gets half as many coins for the same accrued $amount.
  Equitable but worth understanding.
- **Severity:** P1. Could be addressed two ways:
    1. Accept as-is — the USD amount is the canonical promise; coin
       count is what happens to be worth that USD at claim time
    2. Snapshot `amount_creator_coin_nanos` at accrual time too (add
       column + compute at accrual) and pay the snapshotted amount
- **Fix:** Design decision for Phase 3. Recommendation: snapshot the
  amount at accrual (option 2). Matches how we snapshot DESO nanos for
  auditability, and means the platform pool doesn't slowly bleed out
  to holders on price upswings. Add `amount_creator_coin_nanos` +
  `creator_coin_price_at_accrual` columns in a Phase 3 migration.

### Target behavior (after fixes)

#### Accrual — no changes from what's already built

The Step 3c snapshot logic stays. Only schema addition: add
`amount_creator_coin_nanos` and `creator_coin_price_at_accrual` to
the `holder_rewards` table (Phase 3 migration per REWARDS-7 decision).
Update `snapshotHolders` to populate these at accrual time.

#### Claim — new flow

```
User opens Caldera dashboard, sees "$X claimable" for their holdings
      │
      ▼
User clicks "Claim rewards" on a token (e.g., $bitcoin)
      │
      ▼
POST /api/holder-rewards/claim
body: { tokenSlug: 'bitcoin' }
(Claim is per relevant token, not per trade — aggregates all pending
rows for this holder + this token into a single on-chain transfer.)
      │
      ▼
Next.js middleware
  - Auth session verification (shared with all money routes)
  - Per-user rate limit
      │
      ▼
Route handler
  1. Zod parse body (tokenSlug)
  2. Load all holder_rewards rows WHERE
       holder_deso_public_key = session.desoPublicKey
       AND token_slug = tokenSlug
       AND status = 'pending'
  3. If zero rows: return 404 "nothing to claim"
  4. Sum amount_creator_coin_nanos (or compute from amount_usd at
     current price per REWARDS-7 decision) → total_coin_nanos
  5. Verify platform wallet holds ≥ total_coin_nanos of this creator
     coin (solvency check via GetHodlersForPublicKey with platform
     as holder)
     - If not: UPDATE all selected rows to
       status='blocked_insolvent'. Return 503. Alert admin.
  6. Mark rows as 'in_flight' (pessimistic lock):
       UPDATE holder_rewards SET status='in_flight'
       WHERE id IN (selected row ids)
  7. Build TransferCreatorCoin tx:
       sender = PLATFORM_PUBLIC_KEY
       creator = tokenSlug's creator.deso_public_key
       recipient = session.desoPublicKey
       coin_nanos = total_coin_nanos
  8. signAndSubmit via lib/deso/transaction.ts
     - Success:
         UPDATE selected rows SET
           status='claimed'
           claim_tx_hash=<hash>
           claimed_at=NOW()
         Return 200 with tx_hash
     - Failure:
         UPDATE selected rows SET
           status='failed'
           failed_reason=<msg>
         Return 500 with correlation ID
```

Per-user atomicity. Per-token claim (not per-row) to minimize on-chain
transactions. Rows never deleted — status transitions preserve the
audit trail.

### Dependencies (what needs to exist before fixes land)

- Phase 2 primitive: Auth middleware (shared with BUY-1, SELL-1,
  RESOLUTION claim)
- Phase 2 primitive: `lib/deso/transfer.ts` (new) with
  `transferCreatorCoin(...)` — **blocks REWARDS-1 and likely Path 5**
- Phase 2 primitive: Platform wallet creator-coin solvency check
  (extension of `lib/deso/platformWalletHealth.ts` from 3d.4 scope)
- New API route: `POST /api/holder-rewards/claim`
- New API route: `GET /api/holder-rewards/balance` (summary per user)
- New SQL view: `v_holder_rewards_pending_by_user`
- DB migration: new statuses — `'in_flight'`, `'claimed'`,
  `'failed'`, `'blocked_insolvent'`, `'abandoned'`. Update CHECK.
- DB migration (REWARDS-7 resolution): add
  `amount_creator_coin_nanos`, `creator_coin_price_at_accrual`
- New UI: claim widget, balance display, claim-success confirmation
- Copy update: terms and footer reference reality once claim lives
- Phase 4 reconciliation: find stale `'pending'` and `'in_flight'`
  rows; retry or surface to admin

---

## Path 5 — Creator Profile Claim

### What it should do

A creator whose profile was created by Caldera (as a shadow profile
during market discovery) sees their `CALDERA-XXXX-XXXX` claim code
posted publicly, comes to the claim page, proves they are the real
entity, and links their DeSo wallet to the Caldera creator record.
After this flow:

- The `creators` row has `claim_status='claimed'` and
  `claimed_deso_key` set to the DeSo public key the creator owns
- Any accrued `unclaimed_earnings_escrow` on that creator has been
  transferred to the creator's DeSo wallet on-chain in DESO
- A `creator_claim_payouts` row records the payout event with
  `tx_hash`, completing the append-only audit trail
- The `unclaimed_earnings_escrow` column is zeroed **only after**
  the on-chain transfer confirmed
- All subsequent fees that would have accrued to escrow now flow
  directly to the creator's wallet (per tokenomics-v2)

**Payout model (locked 2026-04-23): DESO, not creator coins.** Creators
want money. Paying them in their own coins (which they already mostly
own via the founder-reward mechanic) would be weird and dilutive. DESO
is the simple, correct choice — structurally like Path 3 winner
payouts, unlike Path 4 holder rewards which pay in creator coins.

### Current flow (2026-04-23)

**Five redundant routes implement claim logic, none of them send
DESO.** The flow actively corrupts the ledger by zeroing the escrow
column without any on-chain transfer.

The five claim-related routes:

- `app/claim/[code]/page.tsx` — UI page
- `app/api/claim/verify/route.ts` — sets claim_status; no escrow
  handling at all
- `app/api/creators/[slug]/verify-claim/route.ts` — zeros escrow,
  rolls into total_creator_earnings, no DESO send
- `app/api/creators/[slug]/claim/route.ts` — same pattern as
  verify-claim, also no DESO send
- `app/api/creators/claim/route.ts` — stub with `// TODO: Full
  transaction signing...` comment; no execution

Plus `ClaimProfileModal.tsx` in `components/shared/` as the UI
entry point.

Current worst-case flow (executed by verify-claim and claim routes):

```
Creator enters claim code on /claim/[code]
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ CLIENT (ClaimProfileModal.tsx)                      │
│ 1. Verify tweet or URL scrape proving the code was  │
│    posted by the real creator                       │
│ 2. Connect DeSo wallet (gets desoPublicKey)         │
│    ⚠ NO verification that the claimer owns that     │
│    wallet (client-supplied — same gap as BUY-1)     │
│ 3. POST verify-claim (or alt route)                 │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ SERVER (verify-claim or claim route)                │
│ 1. creators.update({                                │
│      claim_status: 'claimed',                       │
│      token_status: 'claimed',                       │
│      claimed_deso_key: userPublicKey,               │
│      unclaimed_earnings_escrow: 0,  ← ZEROED        │
│      total_creator_earnings: prev + prev_escrow,    │
│    })                                               │
│ 2. [STOP — no DESO send, no tx_hash, no ledger row] │
└─────────────────────────────────────────────────────┘
         │
         ▼
   Creator sees "claimed!" success
   UI shows $X claimed in total_creator_earnings
   ⚠ No money has moved
   ⚠ The DB no longer records that the creator was ever owed money
   ⚠ total_creator_earnings is now a lying aggregate
```

**This is the worst finding of the audit: claim does not merely fail
to pay, it actively destroys the record of what was owed.** Other
broken paths (resolution, holder rewards) leave the DB honestly
saying "pending." Creator claim leaves it saying "paid" — falsely.

### Schema touched (current)

- `creators`:
  - `claim_status` → 'claimed'
  - `token_status` → 'claimed'
  - `claimed_deso_key` → user's key
  - `unclaimed_earnings_escrow` → 0 (destructive)
  - `total_creator_earnings` → += prev escrow (lying aggregate)

Notably NOT touched:
- No ledger row anywhere records the claim event
- No `tx_hash` stored
- No status like 'pending_payout' or 'in_flight' to track the attempt

### Trust boundaries crossed (current)

- **Client-trusted `desoPublicKey`** — same gap as BUY-1/SELL-1
- **Tweet/URL verification** — external trust boundary, reasonable
  for MVP but brittle (Twitter API changes, URL scraping breaks)
- **Wallet ownership** — not verified. Someone could post the code
  with their own DeSo key and claim the profile (and eventually any
  future DESO payouts) without being the real creator

### 🚨 Critical findings

#### CLAIM-1: Escrow zeroed without DESO transfer — active ledger corruption (P0)

- **Evidence:** `app/api/creators/[slug]/verify-claim/route.ts` and
  `app/api/creators/[slug]/claim/route.ts` both execute
  `creators.update({ unclaimed_earnings_escrow: 0, total_creator_earnings: prev + prev_escrow, claim_status: 'claimed' })`
  with no DESO send anywhere in the codebase between these operations.
- **Impact:** Worst finding of the audit. The DB state after a claim
  says "this creator was paid $X" but no DESO moved on-chain. Future
  investigation of "did creator X receive their money?" cannot be
  answered from DB state because the evidence has been erased.
  Creators who claim today get nothing and the system doesn't
  remember they're owed anything.
- **Severity:** P0 critical launch blocker. This is worse than not
  implementing the payout — it actively hides the liability. Must
  be fixed before any real creator is offered a claim.
- **Fix:** Completely rewrite the claim flow. Never zero the escrow
  column before DESO confirmed sent. Introduce `creator_claim_payouts`
  ledger table (append-only per the Liability-Ledger pattern). Follow
  target flow below.
- **Status: ✅ RESOLVED (2026-04-26, P3-5)**
  `POST /api/creators/[slug]/claim` (12-gate combined flow) atomically
  zeroes escrow ONLY after on-chain DESO send confirmed. Audit row in
  `creator_claim_payouts` created BEFORE on-chain attempt (status:
  `in_flight`). Failure paths leave row `failed` with escrow untouched.
  Catastrophic post-send DB failure leaves row `in_flight` and is
  logged CRITICAL for Phase 4 reconciliation sweep — escrow is NEVER
  zeroed without on-chain confirmation. Commits: `878ecad` (schema +
  `creator_claim_payouts` table + RPC v1), `a0e9d35` (RPC v2 with
  profile-claim branch), `131586a` (route body).

#### CLAIM-2: Identity and wallet-ownership verification both client-trusted (P0)

- **Evidence:** Same pattern as BUY-1 and SELL-1. The claim routes
  accept `desoPublicKey` from the request body with no session
  verification. Additionally, there is no challenge-response proving
  the claimer owns the wallet they're linking to the profile.
- **Impact:** Attacker who sees a public claim code (`CALDERA-XXXX-XXXX`
  posted on Twitter) can hit the claim endpoint with their OWN
  `desoPublicKey`, attach themselves to the creator's profile, and
  receive all future DESO payouts to that profile — either via
  claimed-escrow releases or direct fee flows under tokenomics-v2.
- **Severity:** P0 launch blocker. Direct theft surface. A front-run
  attack on any creator who posts their code before the real creator
  claims it.
- **Fix:** Same auth middleware as BUY-1/SELL-1/RESOLUTION claims —
  verify session's `desoPublicKey` matches request. Additionally,
  require a signed nonce/challenge during the claim flow proving the
  claimer controls the wallet private key (standard "sign this message
  with your wallet" pattern). The tweet/URL verification proves
  "this person owns the creator identity"; the signed challenge proves
  "this wallet is theirs." Both required.
- **Status: ✅ RESOLVED (2026-04-26, P3-5)**
  P2-5 (commit `a87c616`) shipped fresh-JWT to canonical
  `/api/creators/[slug]/claim` and `/api/claim/verify`. P3-5.4
  (commit `d391321`) deleted the legacy stub `/api/creators/claim`
  that lacked fresh-JWT. The canonical claim route (P3-5.5,
  `131586a`) enforces both P2-1 cookie auth and P2-5 fresh-JWT
  before any state mutation.

#### CLAIM-3: Five redundant claim routes (P1)

- **Evidence:** Routes listed above — `/api/claim/verify`,
  `/api/creators/[slug]/verify-claim`, `/api/creators/[slug]/claim`,
  `/api/creators/claim`, plus the UI in `app/claim/[code]/page.tsx`
  and `ClaimProfileModal.tsx`. All do subsets of the same job, all
  differently, all with the same core bug.
- **Impact:** Maintenance disaster. Fixing the escrow-destruction bug
  must be done in multiple routes. Drift guarantees recurring bugs.
- **Severity:** P1. Not a direct correctness issue but blocks clean
  implementation of CLAIM-1 fix.
- **Fix:** Consolidate into a single canonical route:
  `POST /api/creators/[slug]/claim`. Delete the other 3 backend
  routes. `ClaimProfileModal.tsx` calls only the canonical route.
  Do this refactor FIRST as its own commit before the CLAIM-1 fix.
  Stub route `/api/creators/claim/route.ts` deleted with an explicit
  "this TODO is obsolete — see /api/creators/[slug]/claim" note in
  the commit message.
- **Status: ✅ RESOLVED (2026-04-26, P3-5, partial-as-designed)**
  P3-5.4 (commit `d391321`) deleted the legacy stub
  `/api/creators/claim` with zero callers. `POST /api/creators/[slug]/claim`
  is now the single money-path route. The remaining claim-related
  routes (`verify-claim`, `tweet-verify`, `generate-claim-code`,
  `watch-claim`) handle verification/notification, NOT the money path
  — they remain by design (separate concern).

#### CLAIM-4: TransferCreatorCoin primitive not needed for this path (informational)

- **Evidence:** Payout design decision 2026-04-23 is DESO, not creator
  coins. Creator claim therefore uses `send-deso` (already in
  `lib/deso/transaction.ts` / buyback plumbing), not the yet-unbuilt
  `lib/deso/transfer.ts`.
- **Impact:** Creator claim implementation is NOT blocked on the
  TransferCreatorCoin primitive (which blocks holder rewards claim).
  Can be worked on in parallel.
- **Severity:** N/A — design clarification.
- **Note:** This is informational. Including in the findings list so
  a future reader doesn't incorrectly assume creator claim and holder
  rewards claim share the same primitive dependency.

### 🟡 Concerns

#### CLAIM-5: `total_creator_earnings` column currently a lying aggregate

- **Evidence:** Zero production creators claimed currently. But the
  code path exists and would populate `total_creator_earnings`
  incorrectly the moment any creator claims.
- **Impact:** If the column is ever used (admin dashboards, revenue
  reports, creator-facing UI), it would display numbers that don't
  correspond to real DESO that moved.
- **Severity:** P1 hygiene. Zero real data corruption YET because
  zero claimed creators exist. Fix lands with CLAIM-1 rewrite.
- **Fix:** Redefine the column semantic clearly. Two options:
    1. Drop the column; replace with a SQL view that sums
       `creator_claim_payouts.amount` WHERE status='paid'
    2. Keep the column but populate it ONLY from the payout-confirmed
       side, via trigger or application-level rule
  Recommendation: option 1 (view-based). Eliminates the lie surface.
  Migration ordering: build the view, migrate any consumers, then
  drop the column.
- **Note (2026-04-26):** `total_creator_earnings` is no longer a
  "lying aggregate" — every increment is now paired with confirmed
  on-chain DESO via the `mark_creator_claim_complete` RPC (P3-5.4b).
  Replacing the column with a view over `creator_claim_payouts`
  remains deferred hygiene work (CLAIM-5 stays open).

#### CLAIM-6: Tweet/URL verification is brittle

- **Evidence:** The claim flow verifies ownership via scraping a
  tweet or URL where the creator posted their `CALDERA-XXXX-XXXX` code.
- **Impact:** Any change to the Twitter API or the target URL breaks
  the flow. Already on Twitter v2 API (paid) or dependent on scraping
  quirks. Medium-term maintenance risk.
- **Severity:** P2. Works today; worth monitoring.
- **Fix:** Defer. Not a P0 blocker but an ongoing reliability concern.
  Could add alternative verification paths (e.g., creator_slug on
  DeSo already matches the profile the wallet is linked to) in the
  future.

#### CLAIM-7: No idempotency on claim attempts

- **Evidence:** Current code doesn't check for an in-progress or
  already-successful claim before executing the update.
- **Impact:** A double-submit during a slow response (network retry,
  user double-click) could attempt the claim twice. With the current
  broken code, the second attempt would find `claim_status='claimed'`
  and likely no-op. With the fixed code (per CLAIM-1), we need
  idempotency explicitly.
- **Severity:** P1. Edge case, but real.
- **Fix:** In the rewritten claim handler: check
  `creator_claim_payouts` for a row in `status='in_flight'` or
  `'paid'` for this creator before starting. If present, return
  current state rather than starting a second claim. Unique
  constraint on `creator_claim_payouts.creator_id WHERE status IN
  ('in_flight', 'paid')` to enforce at the DB level.
- **Status: ✅ RESOLVED (2026-04-26, P3-5)**
  Idempotency enforced at three layers:
  1. DB: partial UNIQUE index `uq_creator_claim_payouts_active` on
     `creator_id WHERE status IN ('pending', 'in_flight')` — second
     concurrent INSERT fails with 23505 duplicate key violation.
     (P3-5.2, commit `878ecad`. Verified live in Supabase.)
  2. Route Gate 7: SELECT lookup returns 409 `claim-in-progress`
     if any active row already exists. (P3-5.5, commit `131586a`.)
  3. Route Gate 10: 23505 violation caught and returned as 409.

### Target behavior (after fixes)

#### Accrual — no changes

Step 3b logic stays: trade route calls `increment_unclaimed_escrow`
RPC atomically on every buy trade tied to an unclaimed creator. That
column is the "currently claimable in USD" representation.

#### Claim — new flow

```
Creator enters CALDERA-XXXX-XXXX code on /claim/[code]
      │
      ▼
UI (ClaimProfileModal.tsx)
  1. Connect DeSo wallet → get desoPublicKey
  2. Request a challenge nonce from the server
  3. Sign the nonce with the wallet (via DeSo Identity)
  4. Verify tweet or URL contains the code (existing logic)
  5. POST /api/creators/[slug]/claim
     body: { code, signedNonce, tweetUrl }
      │
      ▼
Next.js middleware
  - Rate limit (claim code attempts are expensive, limit tight)
      │
      ▼
Route handler
  1. Zod parse body
  2. Load creator by slug, verify claim_status='unclaimed'
  3. Verify claim code matches
  4. Verify tweet/URL evidence (existing logic)
  5. Verify signed nonce proves ownership of desoPublicKey
  6. BEGIN TX (atomic_start_creator_claim RPC):
       Check no existing creator_claim_payouts row with
       status IN ('in_flight', 'paid') for this creator
       (enforces idempotency via unique index)
       INSERT creator_claim_payouts:
         creator_id
         claimer_deso_public_key
         amount_usd (snapshot of creators.unclaimed_earnings_escrow
                     at this moment)
         amount_deso_nanos (at current rate)
         deso_usd_rate_at_claim
         status='in_flight'
         tweet_url (evidence)
         signed_nonce (evidence)
     COMMIT (returns payout_row_id)
  7. Verify platform wallet solvency:
     - If balance < amount + tx_fee:
         UPDATE creator_claim_payouts SET
           status='blocked_insolvent'
         Return 503 with correlation ID
  8. Build send-deso tx:
     sender = PLATFORM_PUBLIC_KEY
     recipient = claimer_deso_public_key
     amount_nanos = amount_deso_nanos
  9. signAndSubmit via lib/deso/transaction.ts
     - Success:
         BEGIN TX (atomic_settle_creator_claim RPC):
           UPDATE creator_claim_payouts SET
             status='paid'
             tx_hash=<hash>
             paid_at=NOW()
           UPDATE creators SET
             claim_status='claimed'
             claimed_deso_key=<claimer_key>
             unclaimed_earnings_escrow=0
             (zeroed ONLY NOW, after DESO confirmed sent)
         COMMIT
         Return 200 with tx_hash
     - Failure:
         UPDATE creator_claim_payouts SET
           status='failed'
           failed_reason=<msg>
         (creators row UNCHANGED — creator can retry later)
         Return 500 with correlation ID
```

Key properties:
- Escrow zeroed only after DESO confirmed on-chain — ledger never lies
- creator_claim_payouts is append-only audit trail with tx_hash
- Idempotency enforced at DB level (unique index on creator_id for
  non-failed rows)
- Per-user atomicity — failure doesn't affect other creators
- Wallet ownership cryptographically verified via signed nonce

### Dependencies (what needs to exist before fixes land)

- Phase 2 primitive: Auth middleware (shared with all money routes)
- Phase 2 primitive: Signed-nonce challenge flow (new — used here and
  potentially expanded for other verification needs)
- Phase 2 primitive: `lib/deso/transaction.ts` already exists (send-deso
  path via existing signAndSubmit)
- Phase 2 primitive: Platform wallet DESO solvency check (shared with
  Path 3 resolution claim)
- New DB table: `creator_claim_payouts` (ledger)
- New DB migration: unique index on creator_claim_payouts.creator_id
  WHERE status IN ('in_flight', 'paid')
- New DB migration: drop or view-replace `total_creator_earnings`
  column (per CLAIM-5)
- New atomic Supabase RPC: `atomic_start_creator_claim`,
  `atomic_settle_creator_claim`
- Route consolidation refactor (as its own commit): 4 backend routes
  → 1 canonical `POST /api/creators/[slug]/claim`; delete the others
- UI updates: `ClaimProfileModal.tsx` calls only canonical route;
  nonce-challenge flow added; success/failure/in-progress states

---

## Cross-cutting Concerns

Themes that span multiple paths. Each per-path section above references
these but duplicates the framing. This section is the single place to
understand infrastructure-level fixes that solve multiple path-level
findings at once.

### Authentication & identity verification

**Appears in:** BUY-1, SELL-1, CLAIM-2.

All routes that accept a `desoPublicKey` in the request body treat
that value as authoritative without verifying the requester owns the
wallet. There is no auth middleware at any edge.

**Root cause:** The codebase has no concept of an authenticated session
backed by a cryptographic proof of wallet ownership. DeSo Identity sits
on the client; the server has never been taught to trust it only after
verification.

**Fix (one piece of infrastructure, many paths resolved):**

- Build a Next.js `middleware.ts` at repo root that:
    - Extracts session from a signed cookie or Authorization header
    - Verifies the session was created via DeSo Identity signing a
      known challenge (the challenge contains the DeSo public key it
      authorizes)
    - Attaches the verified `desoPublicKey` to the request context
- Route handlers retrieve the verified public key from context instead
  of request body
- Any discrepancy between `body.desoPublicKey` and the session's
  verified key is either an error (401) or a flat reject (ignore body
  value entirely — safer)
- Specific auth pattern (session-cookie vs. signed-message-per-request)
  is documented in Open Questions below

### Rate limiting

**Appears in:** BUY-5 directly. Implied for every other money-movement
route (sell, winner claim, holder rewards claim, creator claim).

No `middleware.ts` exists. The only rate-limited routes today are
`autonomous-cycle` and `markets/[id]/news`.

**Fix:**
- Edge middleware with per-user and per-IP limits
- Per-user key from the authenticated session (depends on auth fix
  above; the two ship together)
- Tighter limits on claim routes (creator claim: 5/min/user;
  winner claim: 30/min/user; buy: 60/min/user; sell: 60/min/user)
- Backing store: Upstash Redis is the common Vercel choice

### Atomicity of money-movement writes

**Appears in:** BUY-4 directly. Required but not-yet-stated-so for
every other multi-table write flow: sell (trade + payout + position
settle), winner claim (payout + position transition), holder claim
(multiple ledger rows + coin transfer), creator claim (payout row +
creator state update).

**Root cause:** Supabase's JS client does not expose transactions over
its request-per-call interface. Every multi-statement flow in the
codebase is sequentially-issued independent calls with no rollback.

**Fix pattern (applies everywhere):**
- Postgres stored procedure (Supabase RPC) wraps any multi-row write
  that must be all-or-nothing
- Function takes all inputs, returns the new row IDs
- RPC is called from TypeScript via `supabase.rpc(...)` with service
  role (because these writes should not be RLS-gated)
- Explicit in SQL: `BEGIN ... COMMIT` inside the function
- Names we'll use: `atomic_record_trade`, `atomic_open_sell_trade`,
  `atomic_settle_sell_trade`, `atomic_resolve_market`,
  `atomic_start_creator_claim`, `atomic_settle_creator_claim`,
  plus per-claim helpers for holder/winner flows as needed

### On-chain transaction verification

**Appears in:** BUY-2, BUY-3 specifically — the only path that ever
takes an incoming client-submitted tx_hash.

**Root cause:** Server never queries DeSo to confirm an incoming
transfer matches the claimed shape.

**Fix:**
- New primitive: `lib/deso/verifyTx.ts` with
  `verifyDesoTransfer(txHash, expectedSender, expectedRecipient, expectedAmountNanos): Promise<VerifyResult>`
- Checks: tx exists on-chain; sender/recipient match; amount ≥ expected
  (to handle rate rounding); tx not already consumed by another trade
- Uniqueness via DB UNIQUE constraint on `trades.tx_hash` enforces
  "not already consumed"
- Network failure handling: if DeSo API is unavailable, REJECT the
  trade (do not admit under uncertainty) — better to frustrate a real
  user for 30 seconds than to admit a spoofed trade
- Sole consumer today is `/api/trades` POST

### Redundant route consolidation

**Appears in:** RESOLUTION-2 (3 redundant routes), CLAIM-3 (5 redundant
routes).

Pattern: feature was iterated on without consolidating. Each iteration
added a new route alongside the old rather than replacing.

**Fix pattern:**
- Extract shared logic to `lib/<domain>/<action>.ts`
- Routes become thin wrappers (auth + parse + call + response)
- Delete obsolete routes in the same PR as the extraction
- Migration ordering: do the extraction-and-delete as a pure refactor
  commit BEFORE any behavior-change commits; easier to review
- Specific work: `lib/markets/resolution.ts` (consolidates 3 routes);
  `lib/creators/claim.ts` (consolidates 4 backend routes);
  `app/api/creators/[slug]/claim/route.ts` becomes the single
  canonical endpoint

### Reconciliation & pending-state visibility

**Appears in:** BUY-7 (5 trades with null tx_hash), REWARDS-4 (5 stale
pending auto_buy_pool rows), and implicitly every path that introduces
an 'in_flight' intermediate status.

**Root cause:** No tooling exists to detect ledger rows stuck in a
non-terminal state. When a fire-and-forget fails silently, the row
sits forever.

**Fix (Phase 4 work, named now):**
- Scheduled job finds rows in non-terminal status older than N minutes
- Categorizes: retryable (transient failures), stuck (needs human),
  abandoned (pre-migration legacy)
- Admin dashboard surfaces counts per category per path
- Alerts (email or similar) on thresholds
- Explicit "mark abandoned" action for operator intervention
- Tables to watch: `fee_earnings` (status='pending' or 'failed'),
  `holder_rewards` (same), `position_payouts` (once introduced),
  `creator_claim_payouts` (once introduced), `trades` (with new
  `payout_status='pending'` column)

### Ledger discipline

**Appears in:** CLAIM-1 most egregiously (actively destroys ledger
records on claim). Implicit pattern in every path.

**Principle:** the money-movement ledger is append-only with
status transitions. Never zero, never delete. Every amount stored is
preserved forever with its accrual context.

**Where it applies:**
- `fee_earnings` (✅ already follows this — status only transitions)
- `holder_rewards` (✅ accrual correct; claim must preserve rows with
  status='claimed' not delete)
- `position_payouts` (new — follow the pattern from day one)
- `creator_claim_payouts` (new — follow the pattern from day one)
- `creators.unclaimed_earnings_escrow` — the ONE exception, because
  it's a "currently claimable" counter, not a ledger row. Must agree
  with the sum of `creator_claim_payouts` WHERE status='paid' for
  that creator.

Anywhere else that wants to represent a liability, prefer a new
ledger table over a column-on-an-existing-table.

### Marketing / copy integrity

**Appears in:** REWARDS-2 specifically (terms page + footer promise
"manual claim" feature that doesn't exist). Implicit audit needed
across all site copy.

**Fix:**
- Before each path's P0 fix lands and ships to main, audit every
  `app/` page, component, and public-facing string for claims that
  presume unfixed behavior
- Update in the same commit as the backend fix
- Legal/compliance principle: no promise in user-facing copy
  should describe behavior not implemented in code

### Legacy data cleanup

**Appears in:** BUY-7 (5 null-tx_hash trades), REWARDS-4 (5 stale
pending auto_buy_pool rows), SELL-8 (unused `deso_staked_nanos` +
`txn_hash` columns on positions), CLAIM-5 (lying
`total_creator_earnings` column).

**Fix principle:**
- Each piece of legacy gets an explicit resolution: kept (documented
  why), migrated (to new canonical location), or removed (with safety
  check in the migration)
- Never silently drop columns or rows
- Document in CHANGELOG of this doc when each legacy cleanup lands

### Observability

**Appears in:** Implicit across all paths — no dedicated finding
because it's a shared gap, not a per-path bug.

Current state:
- Error logging inconsistent: some supabase.insert() calls destructure
  `{error}` and log via console.error; many historically did not
- No structured logging; Vercel logs are text blobs
- No metrics (e.g., count of rejected trades per minute, count of
  successful creator claims per day)
- No alerts on platform wallet balance or solvency conditions

**Fix (phased):**
- Phase 3 hygiene: every route that writes to a money-movement table
  must destructure `{error}` and log. This is already established
  pattern post Step 3 — just needs to be audited against older code.
- Phase 4 observability infrastructure:
    - Structured logs (JSON to Vercel or Upstash)
    - Aggregated metrics (Sentry or similar)
    - Platform wallet balance monitoring (originally Step 3d.4 scope;
      now a cross-cutting requirement)
    - Alert thresholds: wallet balance low, pending rows growing,
      failed-status count spike

### Security hardening beyond auth

**Appears in:** Implicit — not specifically surfaced as findings
because they're at a different architectural layer.

- No CSRF protection on mutating POST routes. Once auth cookies exist
  (from the auth middleware fix above), CSRF matters. Use same-site
  cookies as a baseline; add explicit CSRF tokens on claim routes.
- Signed-nonce challenge pattern (proposed for CLAIM-2) is a useful
  pattern for any high-value mutation. Consider applying to:
    - creator_claim (locked in)
    - winner_claim (large payouts)
    - holder_rewards_claim (bulk payout events)
- Input sanitization: Zod parsing is sufficient for JSON body
  validation. SQL injection is not a direct concern (Supabase client
  parameterizes). XSS concerns only apply to content-rendering paths,
  not money-movement routes.

---

## Prioritized Fix List

The sequenced plan for turning the audit findings into correct code.
Organized by phase, then by dependency order within each phase.

**Legend:**
- **P0** — Launch blocker. Must be resolved before real users.
- **P1** — Hardening / correctness. Required for production quality,
  not strictly for launch.
- **P2** — Future / nice-to-have.
- **[scope: X sessions]** — rough estimate of pair-programming sessions
  at the current pace. Not deadlines — sanity checks.

Phases reference the overall rebuild plan:
- **Phase 2** — Shared primitives (foundation)
- **Phase 3** — Per-path fixes (build on primitives)
- **Phase 4** — Operational tooling (reconciliation, observability)
- **Phase 5** — Integration tests
- **Phase 6** — Merge to main

---

### Phase 2 — Shared Primitives (build in this order)

Each primitive unblocks one or more Phase 3 path fixes. Build in
dependency order; parallelize only where explicitly noted.

#### P2-1. Auth middleware [P0] [scope: 1-2 sessions]

**What it is:** Next.js edge middleware (`middleware.ts` at repo root)
that verifies the requester owns the `desoPublicKey` they're acting
as. Session-backed or signed-message-per-request (specific pattern in
Open Questions). Attaches a verified `desoPublicKey` to request
context; rejects anything that can't be verified.

**Unblocks:** BUY-1, SELL-1, CLAIM-2. Also protects every new route
introduced in Phase 3 by default.

**Dependencies:** None. First piece to build.

**Done when:**
- `middleware.ts` live at repo root
- All current `/api/trades`, `/api/trades/sell`, creator claim routes
  require auth (401 without valid session)
- Session key matching the request body's `desoPublicKey` is enforced
- Unit tests for the middleware logic (valid session, expired session,
  missing session, mismatched public key)
- Integration test on preview: a request with no session returns 401;
  a valid session is attached to req.context

#### P2-2. `lib/deso/verifyTx.ts` [P0] [scope: 1 session]

**What it is:** New module with `verifyDesoTransfer(txHash,
expectedSender, expectedRecipient, expectedAmountNanos)` that queries
DeSo on-chain for a tx by hash, returns typed success/failure.

**Unblocks:** BUY-2, BUY-3 (closes the free-money glitch in buy).

**Dependencies:** None. Can be built in parallel with P2-1.

**Done when:**
- Module exports `verifyDesoTransfer(...)` returning tagged union
  (matches `signAndSubmit` tagged-result pattern)
- Handles: tx not found, sender mismatch, recipient mismatch, amount
  less than claimed, DeSo API unavailable (rejects under uncertainty)
- Unit tests cover each rejection path
- Smoke test against a real DeSo tx on preview (the Step 3d
  `51fb45f8...` tx, or any known tx) verifies the happy path

#### P2-3. Rate limiting infrastructure [P0] [scope: 1 session]

**What it is:** Per-user and per-IP rate limits on money-movement
routes. Lives in the same `middleware.ts` as P2-1 or adjacent.
Backing store: Upstash Redis or equivalent.

**Unblocks:** BUY-5 directly. Defense in depth for every claim route.

**Dependencies:** P2-1 (needs verified user identity for per-user keys).

**Done when:**
- Per-user limits live: buy 60/min, sell 60/min, winner claim 30/min,
  holder rewards claim 30/min, creator claim 5/min
- Per-IP baseline for unauthenticated attempts
- Rejection returns 429 with Retry-After header
- Metrics surfaced for rate-limit hits (ties into Phase 4
  observability)

#### P2-4. `lib/deso/transfer.ts` [P0] [scope: 1-2 sessions]

**What it is:** New module with `transferCreatorCoin(fromSeed,
recipientPublicKey, creatorCoinPublicKey, amountCoinNanos)` that
signs + submits a DeSo `TransferCreatorCoin` operation. Pattern
mirrors `lib/deso/buyback.ts` (shipped 3d.2c): fire-and-forget
contract, never throws, writes status/tx_hash back to ledger row.

**Unblocks:** REWARDS-3 → which blocks Path 4 (holder rewards claim).

**Dependencies:** None for the primitive itself; consumers depend on
Phase 3 path work.

**Done when:**
- Module exports `executeTokenTransfer({...})` matching the shape of
  `executeTokenBuyback`
- Handles: invalid inputs, rate fetch, too-small-amount floor,
  DeSo API failure, sign failure, submit failure
- Writes status ('paid'/'failed') and tx_hash to a caller-specified
  ledger row on completion
- Unit tests for `validateTransferInputs`
- Smoke test on preview: transfer ~0.0001 $bitcoin from platform
  wallet to a test wallet, verify on-chain

#### P2-5. Signed-nonce challenge flow [P0] [scope: 1 session]

**What it is:** Small infrastructure for issuing a random challenge
nonce and verifying the client's signed response proves they control
a given DeSo wallet. Used at critical state-change moments beyond
bare auth.

**Unblocks:** CLAIM-2 wallet-ownership proof. Also available to
future sensitive operations (e.g., wallet un-linking, admin-level
creator profile changes).

**Dependencies:** P2-1 (auth exists; nonce is a stronger per-action
proof on top).

**Done when:**
- `POST /api/auth/challenge` returns a nonce tied to a desoPublicKey
  and an action type
- Server stores nonce with TTL (Upstash or Supabase)
- Verification helper: `verifyChallengeSignature(nonce, signature,
  publicKey)` validates the signature was produced by the wallet
- Single-use: nonce invalidated after first verification
- Unit tests for nonce generation, signature verification, replay
  rejection

#### P2-6. Platform wallet solvency helpers [P1] [scope: 1 session]

**What it is:** `lib/deso/platformWalletHealth.ts` — originally scoped
for Step 3d.4 (the commit that didn't land). Functions:
`getPlatformDesoBalance()`, `getPlatformCreatorCoinBalance(coinPk)`,
`isSolventFor(amountNanos, coinPk?)`.

**Unblocks:** RESOLUTION-3, CLAIM-1 (solvency checks), plus Phase 4
observability dashboards.

**Dependencies:** None. Pure read-side queries against DeSo.

**Done when:**
- Module exports the three functions above
- Results cached for ~30s to avoid DeSo API spam
- Admin endpoint `GET /api/admin/platform-wallet-health` exposes JSON
  status (for manual inspection and Phase 4 dashboard)
- Unit tests for threshold logic (healthy/warning/critical)

#### P2-7. Atomic transaction RPC pattern [P0] [scope: baked into Phase 3]

**What it is:** Not a standalone commit. The Liability-Ledger pattern
for any money-movement flow requires Postgres stored procedures
wrapping multi-row writes. Every Phase 3 fix introduces one or more
such RPCs following the same naming and shape conventions.

**Unblocks:** BUY-4 (trade+position+fees atomicity) and the equivalent
atomicity need in every other path.

**Dependencies:** None — baked into each Phase 3 path fix.

**Shape for future writers:**
- Function name: `atomic_<verb>_<object>` (e.g., `atomic_record_trade`,
  `atomic_resolve_market`, `atomic_settle_creator_claim`)
- Takes all required inputs as arguments
- Explicit `BEGIN` / `COMMIT` with meaningful error raises
- SECURITY DEFINER with revoke from anon/authenticated, grant to
  service_role only (pattern from `increment_unclaimed_escrow`,
  Step 3b.1)
- Migration file + rollback file pair per function

---

### Phase 3 — Per-Path Fixes (in order)

Each path is a branch off main, reviewed and merged independently.
Scope includes schema migrations, route changes, UI updates, tests.

#### P3-1. Buy flow hardening [P0] [scope: 2-3 sessions]

**Resolves:** BUY-1, BUY-2, BUY-3, BUY-4, BUY-5, BUY-6, BUY-8
(BUY-7 handled as part of migration safety check).

**Dependencies:** P2-1 (auth), P2-2 (verifyTx), P2-3 (rate limit),
P2-7 (atomic RPC pattern).

**Changes:**
- `app/api/trades/route.ts` — uses auth context, calls verifyTx
  before any DB writes, uses atomic_record_trade RPC
- New migration: `UNIQUE` constraint on `trades.tx_hash` (include
  safety check that no duplicate exists)
- New migration: `NOT NULL` constraint on `trades.tx_hash` (handle
  the 5 legacy rows — likely delete them or add sentinel value)
- New migration: Supabase RPC `atomic_record_trade(...)`
- Zod schema: `amount` gets max bound; `desoPublicKey` removed from
  request body (derived from auth context)
- Client: `TradeTicket.tsx` continues to send DeSo payment before
  POSTing trade (unchanged); POST body no longer includes
  `desoPublicKey`

**Testing:**
- Unit: verifyTx logic, atomic RPC correctness
- Preview: happy-path trade succeeds; attempt with bad tx_hash rejected;
  attempt to replay same tx_hash rejected; rate limit enforced;
  amount > claimed tx amount rejected
- Regression: Step 3 fee accrual and auto-buy still work end-to-end

#### P3-2. Sell flow rewrite [P0] [scope: 2 sessions]

**Resolves:** SELL-1, SELL-2, SELL-3, SELL-4, SELL-6, SELL-7, SELL-8
(SELL-5 is informational, no change needed).

**Dependencies:** P2-1 (auth), P2-3 (rate limit), P2-7 (atomic RPC).

**Changes:**
- `app/api/trades/sell/route.ts` rewrite:
  - Uses auth context
  - Flips order: insert trade with `payout_status='pending'` first
  - Attempts on-chain send via `signAndSubmit`
  - On success: atomic RPC closes/reduces position AND updates trade
    to `payout_status='paid'` + `payout_tx_hash`
  - On failure: updates trade to `payout_status='failed'` + reason;
    position untouched
- New migration: add `payout_status`, `payout_tx_hash`, `payout_at`,
  `payout_failed_reason` columns to `trades`; CHECK constraint on
  `payout_status`; partial index for pending/failed rows
- Canonicalize `api.deso.org` (drop `node.deso.org` usage)
- Nanos floor constant moved to shared location
- Drop or document `positions.deso_staked_nanos` and `positions.txn_hash`

**Testing:**
- Unit: atomic settle RPC, payout_status transition rules
- Preview: happy-path sell, simulated DeSo failure (via env override
  or test hook) leaves position open and trade marked failed

#### P3-3. Resolution consolidation + winner claim [P0] [scope: 3-4 sessions]

**Resolves:** RESOLUTION-1, RESOLUTION-2, RESOLUTION-3, RESOLUTION-6
(RESOLUTION-4/5 are P2 future work).

**Sub-order:**

##### P3-3a. Consolidate resolution routes (pure refactor) [scope: 1 session]

- Extract shared logic to `lib/markets/resolution.ts`
- `app/api/admin/resolve-market/route.ts` and
  `app/api/markets/[id]/resolve/route.ts` and
  `app/api/admin/auto-resolve/route.ts` become thin wrappers
- Cron route calls shared lib directly
- Delete nothing yet — just extraction. Deletion happens in
  P3-3b after the new routes are proven live.
- No behavior change. Tests still pass. Green preview.

##### P3-3b. Position payouts ledger + atomic_resolve_market [scope: 1 session]

- New table: `position_payouts` (append-only ledger for winning
  positions; `claim_status` enum: pending, in_flight, paid, failed,
  blocked_insolvent, abandoned)
- New migration: Supabase RPC `atomic_resolve_market(marketId, outcome)`
  that transitions market + positions + inserts position_payouts in
  one transaction
- Update `lib/markets/resolution.ts` to call the new RPC
- After P3-3b lands: resolved markets now have ledger rows
- Still no payout happens (claim flow is P3-3c); UI should start
  showing "$X claimable" on settled winning positions

##### P3-3c. Winner claim API + UI [scope: 2 sessions]

- New route: `POST /api/positions/[id]/claim-winnings` (uses auth
  + rate limit + solvency check)
- Flow per Path 3 target behavior: load payout row, mark in_flight,
  send DESO, mark paid/failed
- New UI component: "Claim $X" button on settled winning positions
- Email/push notification: "Your position won $X — claim anytime"
- After P3-3c lands: winners can actually receive DESO

**Testing:**
- Unit: atomic_resolve_market, claim-winnings idempotency
- Preview: resolve a small market with a winning position, claim it,
  verify DESO lands on-chain (same pattern as Step 3d test trade)

#### P3-4. Holder rewards claim [P0] [scope: 3-4 sessions]

**Resolves:** REWARDS-1, REWARDS-2, REWARDS-3, REWARDS-4, REWARDS-5,
REWARDS-6, REWARDS-7.

**Dependencies:** P2-1, P2-3, P2-4 (transferCreatorCoin), P2-6
(solvency), P2-7.

**Sub-order:**

##### P3-4a. Schema updates [scope: 0.5 session]

- Migration: add `amount_creator_coin_nanos` and
  `creator_coin_price_at_accrual` columns to `holder_rewards`
- Migration: expand `holder_rewards.status` CHECK to include
  `in_flight`, `claimed`, `failed`, `blocked_insolvent`, `abandoned`
- Update `snapshotHolders` in `lib/fees/holderSnapshot.ts` to
  populate the new columns at accrual time (requires fetching the
  relevant token's coin price; extend existing rate fetch)

##### P3-4b. Holder claim API + SQL view + UI [scope: 2 sessions]

- New SQL view: `v_holder_rewards_pending_by_user`
- New route: `GET /api/holder-rewards/balance` — returns aggregated
  pending per token for current user
- New route: `POST /api/holder-rewards/claim` — aggregates per-token,
  locks rows as in_flight, calls `executeTokenTransfer`, transitions
  to claimed/failed based on result
- New UI: rewards dashboard showing claimable tokens, per-token claim
  button
- Copy update: terms and footer match reality

##### P3-4c. Legacy cleanup [scope: 0.5 session]

- Address REWARDS-4 (5 stale auto_buy_pool rows): mark 'abandoned'
  via a one-off script with explicit audit reason

**Testing:**
- Unit: claim aggregation math, rounding correctness with new
  creator-coin nanos field
- Preview: trigger several holder rewards accruals, claim them, verify
  creator coin arrives in the holder's DeSo wallet on-chain

#### P3-5. Creator profile claim rewrite [P0] [scope: 3-4 sessions]

**Resolves:** CLAIM-1, CLAIM-2, CLAIM-3, CLAIM-5, CLAIM-6
(acknowledged P2), CLAIM-7.

**Dependencies:** P2-1, P2-3, P2-5 (nonce challenge), P2-6 (solvency),
P2-7. Intentionally last because it benefits from the claim-flow
template established in P3-3 and P3-4.

**Sub-order:**

##### P3-5a. Consolidate claim routes (pure refactor) [scope: 1 session]

- Extract shared claim logic to `lib/creators/claim.ts`
- Keep the canonical `POST /api/creators/[slug]/claim` as the
  single entry point
- Delete `/api/claim/verify`, `/api/creators/[slug]/verify-claim`,
  `/api/creators/claim` stub
- `ClaimProfileModal.tsx` calls only the canonical route
- No behavior change yet. Tests pass. The existing bug is still
  present but in one place now.

##### P3-5b. Creator claim payouts ledger + rewrite flow [scope: 2 sessions]

- New table: `creator_claim_payouts` (append-only; statuses match
  the standard set). Unique partial index on creator_id where
  status IN ('in_flight', 'paid') enforces idempotency.
- New migrations:
  - `atomic_start_creator_claim(...)` RPC
  - `atomic_settle_creator_claim(...)` RPC — zeros
    `unclaimed_earnings_escrow` ONLY after DESO confirmed sent
- Rewrite `lib/creators/claim.ts`:
  - Uses signed-nonce challenge for wallet-ownership proof
  - Writes creator_claim_payouts row with `in_flight`
  - Calls `signAndSubmit` for DESO send
  - Transitions row + creator state via atomic_settle
- Drop or view-replace `creators.total_creator_earnings` (CLAIM-5
  resolution)

##### P3-5c. UI and copy [scope: 1 session]

- Update `ClaimProfileModal.tsx` to surface nonce challenge step
- Show pending/succeeded/failed claim state
- Admin dashboard shows claims in progress and stuck claims

**Testing:**
- Unit: atomic_start/settle RPCs, idempotency (double-submit rejected)
- Preview: claim a test shadow profile, verify DESO arrives in claimer's
  wallet, verify escrow zeroed AFTER confirmation, verify ledger row
  status is `paid` with real tx_hash

---

### Phase 4 — Operational Tooling (mostly parallel with late Phase 3)

#### P4-1. Reconciliation tooling [P1] [scope: 1-2 sessions]

Scheduled job finds ledger rows in non-terminal status older than N
minutes. Surfaces counts per path on admin dashboard. Allows operator
retry or mark-abandoned actions. Tables watched:
`fee_earnings`, `holder_rewards`, `position_payouts`,
`creator_claim_payouts`, `trades.payout_status`.

**Dependencies:** Phase 3 path fixes introduce each ledger.

#### P4-2. Structured logging + metrics [P1] [scope: 1 session]

JSON structured logs from all money-movement code paths. Metrics for:
trade success rate, claim success rate, failed-status counts per path.
Platform wallet balance + solvency alerts.

**Dependencies:** Ongoing throughout Phase 3.

#### P4-3. Marketing/copy integrity audit [P0 for launch] [scope: 0.5 session]

Before any path's P0 fix ships to main: audit all user-facing copy,
terms, FAQ, and marketing for claims about unimplemented behavior.
Update in the same commit as the backing code lands.

**Dependencies:** Each Phase 3 merge triggers this check.

#### P4-4. Legacy data cleanup (scheduled as paths land) [P1] [scope: 0.5 session total]

Per-path legacy items handled as part of each Phase 3 path fix:
- BUY-7: 5 null-tx_hash trades → delete or sentinel in P3-1
- REWARDS-4: 5 stale auto_buy_pool pending → mark abandoned in P3-4c
- SELL-8: unused position columns → drop or document in P3-2
- CLAIM-5: `total_creator_earnings` column → view-replace in P3-5b

---

### Phase 5 — Integration Tests [P0] [scope: 1-2 sessions]

Full end-to-end flows on a preview deploy:

- Buy → Sell round trip (same user, single position, verify all on-chain)
- Buy → Hold through resolution → Winner claim (verify DESO received)
- Multiple trades → Holder rewards accrue → Claim (verify creator coins
  received)
- Unclaimed creator market → Creator claim (verify escrow released,
  DESO received, escrow zeroed in ledger)

Attack simulations:
- Replay same tx_hash (should reject)
- Spoof desoPublicKey (should 401)
- Trade amount > on-chain send (should reject)
- Double-submit claim (second should no-op idempotently)
- Rate limit overflow (should 429)

**Dependencies:** All Phase 3 paths shipped.

---

### Phase 6 — Merge to Main [P0] [scope: 0.5 session]

Once Phase 5 passes cleanly on preview:

- Merge `feat/tokenomics-v2` to main (Step 3 work — 26 commits)
- Merge each Phase 3 path's branch in dependency order
- Final staging smoke test on production
- Update DECISIONS.md and CLAUDE.md to reference this doc
- Archive this doc's "Changelog" section with final status per finding

---

### Summary — estimated total scope

Phase 2 primitives: 5-8 sessions
Phase 3 path fixes: 13-16 sessions
Phase 4 operational: 2-3 sessions
Phase 5 integration tests: 1-2 sessions
Phase 6 merge: 0.5 session

**Total: 21-30 pair-programming sessions** to ship a verified,
correctly-architected Caldera. Consistent with the original 10-15
estimate at project kickoff for "fix everything" — the audit
refinement roughly doubled visible scope. Still bounded. Still right.

No rush, only right.

---

## Open Questions

Decisions we've intentionally deferred. Each one has context + tradeoffs
+ my recommendation, but is NOT locked. Before the associated Phase 2 or
Phase 3 work begins, these get resolved and the resolution added to the
Changelog below with a short rationale.

### OQ-1. Auth pattern: session cookie vs. signed-message-per-request

**Context:** P2-1 (auth middleware) is the foundational primitive. Two
common patterns for wallet-backed auth:

- **Session cookie** — User signs a one-time challenge, server issues
  a signed HTTP-only cookie, cookie proves identity on subsequent
  requests (with expiry)
- **Signed-message-per-request** — Every mutating request includes a
  fresh signature over the request body + timestamp; server verifies
  signature before accepting

**Tradeoffs:**
- Session cookie: simpler UX (no popup per action), weaker per-request
  security (cookie replay possible if stolen), easier to reason about
- Per-request signatures: no replay possible (nonce/timestamp bounded),
  heavier UX (some DeSo Identity flows popup per sign), more bugs to
  handle on edge cases

**Recommendation:** Session cookie for most routes + per-request signed
nonce for high-value claim operations (P2-5). Hybrid matches the
per-claim nonce pattern we already locked for CLAIM-2. Defer specific
DeSo Identity integration details until P2-1 starts.

**Locks before:** P2-1 begins.

### OQ-2. Amount snapshot for holder rewards (REWARDS-7)

**Context:** Per Path 4 design, holder rewards pay out in creator
coins (not DESO). At claim time, we compute the coin nanos from the
accrued USD amount. Two options:

- **Compute at claim time** — `amount_usd / current_coin_price` →
  coin nanos. Holder bears price fluctuation of the creator coin
  between accrual and claim.
- **Snapshot at accrual time** — capture `amount_creator_coin_nanos`
  plus `creator_coin_price_at_accrual` on each holder_rewards row.
  Pay out the snapshotted amount regardless of later price change.

**Tradeoffs:**
- Compute-at-claim: simpler schema (no extra columns), matches the
  "USD is canonical" principle, but price movement between accrual
  and claim shifts coins to/from the platform pool unpredictably
- Snapshot-at-accrual: matches how `amount_deso_nanos` already works;
  platform can reason about how many coins are earmarked for holders
  at any moment; slightly more math at accrual time

**Recommendation:** Snapshot at accrual. Matches existing pattern for
`amount_deso_nanos` in `holder_rewards`. Makes platform-side reasoning
about "how many coins are allocated to pending holder rewards" trivial
to answer from the DB. Adds two columns via migration in P3-4a.

**Locks before:** P3-4a begins.

### OQ-3. Dispute mechanism for market resolution

**Context:** RESOLUTION-4 flags that once resolved, outcomes are
final. For crypto markets (price-based, cron-resolved from a feed),
this is defensible. For future subjective markets (sports, politics,
streamer events), contested resolutions are a product-level concern.

**Tradeoffs:**
- Ignore for MVP: crypto markets don't need it. Ship faster.
- Build minimum-viable dispute (e.g., 24-hour challenge window, admin
  review): adds a non-trivial module but enables broader market
  categories sooner.

**Recommendation:** Defer entirely until non-crypto markets are on
the roadmap. Add to the product backlog but not the audit fix plan.

**Locks before:** Non-crypto markets are prioritized (undated).

### OQ-4. Creator coin nanos floor for TransferCreatorCoin

**Context:** DeSo has a 1000-nanos floor for DeSo transfers. We don't
yet know if the same floor applies to creator-coin transfers. If it
does, some holder_rewards rows with sub-floor share amounts can't
be individually paid out.

**Tradeoffs:**
- Assume same floor: skip rows below 1000 coin nanos at claim time,
  leave them at status='pending' indefinitely (essentially lost from
  the holder's perspective)
- Aggregate then pay: the per-token claim pattern we locked already
  aggregates across rows — the risk is an aggregated total still below
  floor for a light holder
- Introduce a per-user minimum claim threshold (e.g., $0.01) to smooth
  the UX: holders accumulate until claim is worth it

**Recommendation:** During P3-4a, smoke-test a sub-floor creator coin
transfer on DeSo preview to answer the factual question. Then decide
between behaviors above. Very likely: honor the floor at claim time,
show holders a "minimum $X needed to claim" message if their aggregated
balance is below floor.

**Locks before:** P3-4b begins.

### OQ-5. Platform wallet solvency alert thresholds

**Context:** P2-6 introduces solvency check helpers. Alert thresholds
(healthy / warning / critical) need specific dollar or nanos values.

**Tradeoffs:**
- Low thresholds ($1 warning, $0.50 critical): sensitive, lots of
  alerts at low volume
- High thresholds ($50 warning, $10 critical): quiet under low volume,
  but warning comes late when volume grows

**Recommendation:** Start conservative and iterate. Initial values:
warning at < $10 DESO equivalent, critical at < $2. Revisit after
platform sees sustained usage. These are configurable via env; no
code change required to adjust.

**Locks before:** P2-6 begins. Values documented in env config.

### OQ-6. Twitter/URL verification fallback for creator claims

**Context:** CLAIM-6 — the tweet/URL verification for creator claims
is brittle. Already dependent on Twitter's paid v2 API or HTML
scraping quirks.

**Tradeoffs:**
- Status quo: works today, breaks with Twitter API changes
- Add alternative verification methods (e.g., DNS TXT record, a signed
  message posted in a specific way)
- Gate the claim behind an admin review queue

**Recommendation:** Keep tweet verification as primary with URL
scraping fallback. Add an admin-override path for edge cases
(creator's account suspended, URL inaccessible). Build the admin
override as part of P3-5c (admin dashboard scope).

**Locks before:** P3-5c UI scope is finalized.

### OQ-7. Resolution of the 5 pre-audit null-tx_hash trades

**Context:** BUY-7 — 5 trades in the DB from before the tx_hash
field was enforced. Cannot be retroactively verified on-chain.

**Tradeoffs:**
- Delete them: cleanest, loses any historical context
- Sentinel value (e.g., `tx_hash='LEGACY-PRE-VERIFY'`): preserves
  rows but explicitly marks them non-verifiable
- Flag column (e.g., `tx_hash_verified=false`): most data but more
  schema complexity

**Recommendation:** Sentinel value. Preserves the historical record
without complicating the schema. The migration in P3-1 that adds
`NOT NULL` to tx_hash first updates any NULL rows to the sentinel,
then adds the constraint. Document in the migration file explicitly.

**Locks before:** P3-1 tx_hash migration.

### OQ-8. Rate limit specific values

**Context:** P2-3 proposed specific per-user limits (buy 60/min,
sell 60/min, winner claim 30/min, holder claim 30/min, creator
claim 5/min). These are opinions, not data.

**Tradeoffs:**
- Too tight: legitimate users see 429s during flurry of activity
- Too loose: minimal defense against automated attacks

**Recommendation:** Start with proposed values. Instrument rate-limit
hits via Phase 4 observability. Iterate based on real usage patterns.
All values env-configurable.

**Locks before:** P2-3 begins. Values can be tuned without code
changes thereafter.

---

## Changelog

Audit findings as they are resolved. Every branch that resolves one or
more findings adds an entry here as part of its merge to main.

Entry format:
```
| YYYY-MM-DD | FINDING-ID | Status | Commit | Notes |
```

Status values:
- **Resolved** — fix shipped and verified
- **Mitigated** — partial fix, remaining work tracked
- **Obsolete** — finding no longer applies (e.g., due to architecture change)
- **Deferred** — intentionally not yet addressed (P2 items usually)

### Resolved

| Date | Finding | Status | Commit | Notes |
|------|---------|--------|--------|-------|
| 2026-04-24 | BUY-1 | Resolved | 410a506 | Buy route now reads verified publicKey from middleware-stamped `x-deso-pubkey` header (P2-1.5). Body-supplied `desoPublicKey` is ignored. Validated E2E on preview: $1 BTC buy with real wallet returned 200, fee accrual + auto-buyback completed correctly. |
| 2026-04-24 | SELL-1 | Resolved | 410a506 | Sell route uses the same auth pattern as buy. Identity comes from middleware-verified session cookie, not request body. |
| 2026-04-24 | CLAIM-2 | Mitigated | 410a506 | Cookie-based identity layer done (see P2-1 branch). Wallet-ownership proof via DeSo JWT signature verification at login. Signed-nonce challenge for high-value actions (CLAIM-2 target per audit) is deferred to P2-5 per the locked hybrid-auth design (OQ-1). Creator-claim route itself still rewrites in P3-5. |
| 2026-04-26 | CLAIM-2 | Resolved | a87c616 | P2-5 fresh-JWT recency check shipped. Two-route fix: (1) /api/claim/verify (live route — frontend caller is app/claim/[code]/page.tsx) now requires desoJwt in body, verified via verifyFreshDesoJwt → DeSo signature + derived-key binding API check + iat within 60s. Body-supplied desoPublicKey is now a CLAIM that gets cryptographically verified, not trusted wholesale. (2) /api/creators/[slug]/claim (orphaned — no frontend caller) also wired with same primitive (P2-5.3, d8bec99) for future Phase 3 consolidation. Pattern C chosen over true nonce challenge because DeSo Identity has no signArbitrary primitive — only identity.jwt(). 60s recency window mitigated by TLS + rate limiting (P2-3). |
| 2026-04-25 | BUY-2 | Resolved | 62e9187 | `/api/trades` now calls `verifyDesoTransfer` from `lib/deso/verifyTx.ts` before any DB writes. Verifier queries DeSo's `api/v1/transaction-info`, checks tx exists, is BASIC_TRANSFER, sender matches authenticated user, recipient is platform wallet, amount ≥ expected (2% tolerance for rate drift). Fails closed on DeSo API unreachable. E2E validated on preview: legit $1 trade 200; random explorer tx hash rejected with `tx-not-basic-transfer`; fake hash rejected with validation error. |
| 2026-04-25 | BUY-3 | Resolved | 62e9187, 00ad130 | Two-layer defense: (1) DB UNIQUE constraint on `trades.tx_hash` added in P2-2.3 migration — Postgres error 23505 → HTTP 409 in route. (2) `verifyDesoTransfer` sender-check rejects replays of someone else's tx (sender would not match authenticated user). E2E validated: reusing own valid tx_hash returned 409 `duplicate-tx-hash`. |
| 2026-04-26 | CLAIM-1 | Resolved | 878ecad, a0e9d35, 131586a | P3-5 combined-flow rewrite. Escrow zeroed only after on-chain DESO confirmed. `creator_claim_payouts` audit ledger created BEFORE transfer attempt; failure paths leave row `failed` with escrow untouched. `mark_creator_claim_complete` RPC (v2, 6 args) wraps escrow-zero + earnings-bump + optional profile-claim in single transaction. Catastrophic post-send DB failure logged CRITICAL with txHashHex for Phase 4 reconciliation. |
| 2026-04-26 | CLAIM-3 | Resolved | d391321, 131586a | P3-5.4 deleted legacy stub `/api/creators/claim` (zero callers). `POST /api/creators/[slug]/claim` is now the single money-path route. Verification routes (`verify-claim`, `tweet-verify`, `generate-claim-code`, `watch-claim`) remain by design — separate concern from the money path. |
| 2026-04-26 | CLAIM-7 | Resolved | 878ecad, 131586a | Three-layer idempotency: (1) partial UNIQUE index `uq_creator_claim_payouts_active` on `creator_id WHERE status IN ('pending','in_flight')` — verified live in Supabase; (2) Route Gate 7 SELECT lookup → 409 before any DB write; (3) Route Gate 10 catches 23505 → 409. |
| 2026-04-26 | BUY-4 | Resolved | abe892f, f94a786, 2a81a48 | P3-1 atomic RPC pattern. `atomic_record_trade` PostgreSQL SECURITY DEFINER function (P3-1.2, deployed live) wraps trade INSERT + market UPDATE + position upsert + fee_earnings × N + optional escrow increment in a single transaction. Either all commit or all roll back. Route (P3-1.3) collapses 10+ sequential awaits into one `supabase.rpc('atomic_record_trade', ...)` call. Pre-generated UUIDs eliminate post-RPC SELECT for autoBuyFeeId. Error mapping: 23505 → 409 reason:replay, market-not-found → 404. |
| 2026-04-26 | BUY-6 | Resolved | 2a81a48 | Amount cap folded into P3-1.3: `amount: z.number().positive().max(10_000)`. Zod rejects oversized amounts at schema parse (400) before rate limit or on-chain verification are hit. |
| 2026-04-26 | SELL-2 | Resolved | cb42018, 5ca9de4 | P3-2 atomic sell flow. Failed `transferDeso` marks `trades.payout_status='failed'` with reason; route returns 500. Position is NEVER closed without on-chain confirmation — position transitions happen only inside `mark_sell_complete` SETTLE RPC, after payout confirmed. State machine: payout_status: pending → paid \| failed. |
| 2026-04-26 | SELL-3 | Resolved | cb42018 | New `payout_tx_hash`, `payout_status`, `payout_at`, `payout_failed_reason` columns on `trades` (P3-2.2 migration, all nullable). `payout_tx_hash` written by `mark_sell_complete` RPC on SETTLE — enables full reconciliation between platform DESO outflows and trade ledger. |
| 2026-04-26 | SELL-4 | Resolved | 5ca9de4 | Correct order enforced in P3-2.3 route: OPEN INSERT (payout_status=pending, no position change) → transferDeso → on success, SETTLE RPC closes/reduces position atomically. Failed transfer leaves position intact; user retries with fresh idempotencyKey. |
| 2026-04-26 | SELL-6 | Resolved | 5ca9de4 | `MIN_PAYOUT_NANOS = BigInt(1_000)` in P3-2.3 route — matches floor in `lib/deso/buyback.ts`. Inconsistent 10,000-nano threshold eliminated. |
| 2026-04-26 | SELL-7 | Resolved | 5ca9de4 | Inline `node.deso.org` send-deso/submit-transaction block removed. Replaced with `lib/deso/transferDeso.ts` (P3-5.3 primitive), which uses canonical `api.deso.org`. |
| 2026-04-25 | BUY-5 (partial) | Mitigated | 62e9187 | Route now uses server-side authoritative DeSo rate from `fetchDesoUsdRate()` to compute `expectedNanosTolerant` for the verification check. Client rate still used for fee splits (Step 3) — full BUY-5 fix requires moving fee math server-side in Phase 3 route rewrite. |
| 2026-04-26 | BUY-5 | Mitigated | 876b09a → 06aa1ec | Per-user Upstash sliding-window rate limit on `/api/trades` (10 req/60s, bucket `trades:{pubkey}`) and `/api/trades/sell` (bucket `sell:{pubkey}`). Per-IP limit on `/api/auth/deso-login` (5 req/60s). Checked after auth (trades) / before body parse (login). Fail-open preserves availability if Upstash is unreachable. Auth middleware (edge) was already landed in P2-1; this commit adds the rate limit layer. Full DoS hardening (stricter limits, CAPTCHA) deferred to production ops. |
| 2026-04-27 | RESOLUTION-2 | Resolved | 0e725b3, 2ff6378, ab7be59, 3434ba5 | P3-3.4a–d. All three resolution routes (cron, admin/resolve-market, markets/[id]/resolve, admin/auto-resolve) refactored to call shared `resolveMarket()` in `lib/markets/resolution.ts`. Routes are now thin wrappers; `settlePositions()` private helper deleted from auto-resolve (~50 lines). Auth bug fixed: markets/[id]/resolve was using a stale 2-key ADMIN_KEYS array; all routes now use canonical `isAdminAuthorized()`. `cancelled` markets now correctly settle positions as losers (was: left open). 8 unit tests for resolution lib. |
| 2026-04-27 | RESOLUTION-1 | Resolved | 7f05465, ac47db1 | P3-3.6–7. New route `POST /api/positions/[id]/claim-winnings`. 12-gate pull-based claim flow: UUID validate → auth → rate limit → platform env check → user lookup → payout row load → ownership check → status check → compute nanos at live DESO rate → solvency preflight → idempotent UPDATE lock (pending\|failed → in_flight) → `transferDeso` on-chain → mark claimed. CRITICAL path: tx on-chain but ledger update failed → 500 + txHashHex in response for Phase 4 reconciliation. 19 unit tests covering all gates + happy path + retry-from-failed. |
| 2026-04-27 | RESOLUTION-3 | Resolved | 7f05465 | Per-claim solvency check in claim-winnings route (Gate 9). `checkDesoSolvency(platformKey, amountNanos)` called before any DB lock or on-chain tx. Insufficient → payout row transitions to `blocked_insolvent`, admin-visible in dashboard. User sees "Pending platform funding" badge with disabled button. Reason `fetch-failed` (DeSo API down) returns 503 without marking blocked. |
| 2026-04-27 | RESOLUTION-6 | Resolved | 1106707, 5ed8e3a | P3-3.8a–b. `GET /api/positions/payouts` returns all `position_payouts` rows for authenticated user (ordered by resolved_at desc), batch-loading market title/slug and position side. `PendingPayouts.tsx` client component: renders one row per actionable payout (pending\|failed\|in_flight\|blocked_insolvent) with contextual button labels ("Claim" / "Retry" / "Processing…" / "Pending platform funding"). Success banner with DeSo explorer tx link, 8s auto-dismiss. Component wired into portfolio-client.tsx directly after `<PendingRewards />`. |

### In Progress

*(Track active branches here to prevent parallel work on same findings.)*

### Deferred

| Finding | Rationale | Revisit when |
|---------|-----------|--------------|
| RESOLUTION-4 | No non-crypto markets on MVP roadmap | Non-crypto markets prioritized |
| CLAIM-6 (long-term) | Tweet verification works today; admin override lands in P3-5c | Twitter API breakage observed |

---

## Document History

| Date | Action | Commits |
|------|--------|---------|
| 2026-04-23 | Doc created, Phase 1 complete | 950c83f → b0903c1 |
| 2026-04-24 | P2-1 shipped (auth middleware). BUY-1, SELL-1 resolved; CLAIM-2 mitigated. | 81b9ef3 → 379c51d |
| 2026-04-25 | P2-2 shipped (tx verification + replay defense). BUY-2, BUY-3 resolved; BUY-5 mitigated. | d962b33 → 62e9187 |
| 2026-04-26 | P2-4 shipped (creator-coin transfer primitive). Infrastructure — unblocks Phase 3 Path 4 (holder rewards claim). No audit finding closes here; waits for route wiring. | d90b080 → 26f12e5 |
| 2026-04-26 | P2-3 shipped (rate limiting). BUY-5 mitigated. `/api/trades` (10/60s per pubkey), `/api/trades/sell` (10/60s per pubkey), `/api/auth/deso-login` (5/60s per IP), `/api/markets/[id]/news` fixed (30/60s per IP, replaced broken in-memory Map). Fail-open: Upstash unreachable → routes proceed. | 876b09a → d45b4d6 |
| 2026-04-26 | P2-5 shipped (fresh-JWT recency check). CLAIM-2 Resolved. Two routes secured: /api/claim/verify (live) and /api/creators/[slug]/claim (orphaned, future-secured). | b3f1b48 → 5d20400 |
| 2026-04-26 | P2-6 shipped (wallet solvency helpers). Infrastructure — no audit finding closes with P2-6 alone. Provides typed preflight balance checks (checkDesoSolvency, checkCreatorCoinSolvency) for Phase 3 Paths 4+5 to consume. Also fixes getUserDesoBalance (missing IncludeBalance: true → was silently returning 0) and getCreatorCoinHoldings (wrong API flags). | bd265c6 → cd3f1a4 |
| 2026-04-26 | P3-1 shipped (buy atomicity + BUY-6 cap). BUY-4 Resolved; BUY-6 Resolved. `atomic_record_trade` RPC deployed live. Route collapsed to single atomic call. Dead v1 coin_holder_distributions path deleted. Service-role client swap. 13 new atomicity tests + auth test updates. 30 trade tests pass, tsc clean. | f5a7e51 → 2a81a48 |
| 2026-04-26 | P3-2 shipped (sell atomicity). SELL-2 (P0), SELL-3 (P0), SELL-4, SELL-6, SELL-7 Resolved. SELL-1 note added (resolved by P2-1). SELL-5 note added (no sell fees — correct per tokenomics). SELL-8 deferred (hygiene). `mark_sell_complete` RPC + payout columns deployed live. Sell route rewritten: 12-gate flow, Zod schema, service-role client, `transferDeso` + `checkDesoSolvency` primitives wired. 18 new sell-atomicity tests; 322 total passing. tsc clean, build green. | 6a4067d → 0c2df25 |
| 2026-04-27 | P3-3 shipped (resolution consolidation + winner claim). RESOLUTION-1 (P0), RESOLUTION-2 (P1), RESOLUTION-3 (P0), RESOLUTION-6 (P0) Resolved. `resolveMarket()` shared lib consolidates 3 redundant routes into thin wrappers. Auth bug (stale 2-key ADMIN_KEYS) fixed across all resolution routes. 12-gate `claim-winnings` route with per-claim `checkDesoSolvency` preflight + `blocked_insolvent` status for admin triage. `GET /api/positions/payouts` + `PendingPayouts.tsx` component + portfolio wire-in. 27 new tests (8 resolution lib + 19 claim-winnings). tsc clean, build green. | 0e725b3 → 5ed8e3a |
| 2026-04-27 | P4 shipped (reconciliation tooling). No audit findings close — Phase 4 is preventive infrastructure. Recovers stuck `in_flight` rows that result from post-send UPDATE failures (transferDeso landed on-chain but final ledger update failed → row stays in_flight forever, user has the money, ledger doesn't know). New `drift_alerts` audit table. `lib/reconciliation/sweep.ts` calls `verifyDesoTransfer` per row and transitions to terminal status. `lib/reconciliation/drift-check.ts` does coarse sum comparison + per-row CRITICAL alerts on tx-mismatches. `POST /api/admin/reconcile` for manual trigger; `GET /api/cron/reconcile` runs every 6 hours via Vercel cron. Coverage: position_payouts + creator_claim_payouts. Holder_rewards EXCLUDED from sweep + drift coverage pending verifyCreatorCoinTransfer primitive (creator-coin transfers need a different verifier than DESO transfers; tracked as Phase 4.5 or 5). 46 new tests (24 sweep + 12 drift + 10 endpoint). tsc clean, build green. Also: bug fix in drift-check.ts where transient DeSo API errors fake-triggered WARN drift alerts; ledgerSum increment now conditional on verifyTx outcome. | 58ef097 → 8c670a8 |
| 2026-04-27 | /claim/[code] frontend wired to rebuilt money path. Post-rebuild bug discovered: the legacy `/api/claim/verify` route used by the public claim page never sent DESO to creators — it only flipped profile-status flags. Real escrow accumulating in `unclaimed_earnings_escrow` stayed in the database forever. Closed via 7 sub-commits on `feat/claim-code-frontend`: BURN language purged from UI per locked tokenomics policy (6 files); `unclaimed_earnings_usd` cache field swapped for authoritative `unclaimed_earnings_escrow` ledger; new `lib/creators/claim-payout.ts` shared lib extracts the money path; canonical `/api/creators/[slug]/claim` refactored to call shared lib (433→224 lines, behavior identical); legacy `/api/claim/verify` wired to same shared lib (now does atomic+ledgered+idempotent payout, just like canonical); page success state shows DESO amount + explorer link when escrow > 0; server-side metadata + dynamic OG image for viral share cards. No new audit finding IDs — these were post-rebuild bugs from legacy frontend bypassing the rebuilt path. Memory #11 consolidation goal satisfied via shared lib (two routes with distinct security models share one money path) rather than single route. 395 tests passing. | f520580 → cb0f369 |
| 2026-04-28 | HRV series — closes the holder_rewards reconciliation gap deferred from Phase 4. New `lib/deso/verifyCreatorCoinTransfer.ts` primitive verifies `CREATOR_COIN_TRANSFER` transactions on the DeSo chain (different metadata structure than `BASIC_TRANSFER` — no Outputs array, recipient in `AffectedPublicKeys`, coin identified by username, amount in `CreatorCoinTransferTxindexMetadata`). Tagged-union return matches `verifyDesoTransfer`'s pattern; reuses `hexTxHashToDesoBase58Check`. Owns its own fetch helper for isolation. Validated against real on-chain claimed tx eaf0ae77 (455400 $bitcoin nanos, platform → BC1YLhri…ZBB). New `sweepHolderRewards` + `driftCheckHolderRewards` extend `lib/reconciliation/{sweep,drift-check}.ts` with the same atomic + ledgered + idempotent pattern as the DESO siblings; sums accumulated in CREATOR COIN NANOS (flagged in alert detail to prevent forensic confusion). Both wired into POST /api/admin/reconcile and GET /api/cron/reconcile (same every-6h cadence). Coverage: position_payouts + creator_claim_payouts + holder_rewards (3 tables). 39 new tests (14 verifier unit + 9 mapCctVerifyOutcome + 7 sweep integration + 7 drift integration + 2 admin route updates) → 434 total. No new audit finding IDs — this is preventive infrastructure same category as Phase 4. Memory #28 (Phase 4 deferral) and #29 (REBUILD COMPLETE deferred items) gap closed. tsc clean, build green throughout. | 623e0f6 → f2f02c0 |
| 2026-04-28 | Stream 1.3a — fix(trades): crypto-market creator routing bug. Route was looking up creator rows by `market.creator_slug` without guarding against crypto markets; on a BTC market with `creator_slug='bitcoin'` the lookup found the bitcoin creator profile (claim_status='unclaimed') and routed the 0.5% creator slice to escrow. Per locked tokenomics (memory #1, #2): crypto markets have NO creator slice — the 0.5% must fold into holder_rewards_topup. One-line route guard `!mktFields.crypto_ticker` added at app/api/trades/route.ts:207. Calculator (`lib/fees/calculator.ts`) was correct; bug was at the route layer only. 4 regression tests in `__tests__/api/trades-crypto-creator.test.ts` exercising the production-state mock pattern (creators table has matching slug row, route must NOT use it). 438 tests passing. Companion data fix in production: 6 stray fee_earnings rows deleted (`recipient_type='creator_escrow'`, `recipient_id=bitcoin_creator_id`, sum $0.030); bitcoin creator's `unclaimed_earnings_escrow` zeroed (was $0.015 — half-discrepancy from a separate undocumented event during Apr 23–24 RPC inconsistency, unrecoverable without audit trail). All-or-nothing transaction with pre/post-flight assertions, validated against ground-truth recon. No new audit finding IDs; this is a route-layer bug found by the deep audit + ledger-reconciliation work. | ee190c5 → 4a840f4 (+ data SQL) |
| 2026-04-28 | Stream 2 Phase 1 — treasury dashboard backend. Surfaced by Stream 1 deep audit: platform wallet contains a mix of revenue + position liability + holder rewards reserve + creator escrow with no separation; impossible to know "how much is mine vs. owed" at any moment. New `lib/finance/liability.ts` computes a complete `TreasurySnapshot` per asset class. DESO liability = open_position_worst_case (Σ shares × $1) + pending_position_payouts + creator_escrow, all converted via single fetched DESO/USD rate. Per-coin liability = real-time USD→coin conversion using `coin_price_usd = bonding_curve_price_deso × deso_usd_rate` (units explicit; mixing them inflates ~5x). Status thresholds: healthy / tight / insolvent / unknown (last when price fetch fails non-fatally). Operational buffer 0.5 DESO + 0 creator coin nanos (Phase 1 conservative). Read-only `GET /api/admin/treasury` with Bearer auth via existing `isAdminAuthorized`. Bigint fields serialized as decimal strings. 17 tests (13 unit + 4 route integration), 455 total. Phase 2 (admin UI) deferred. No new audit finding IDs — preventive infrastructure analogous to Phase 4 reconciliation. | 339fdff → 347fc57 |
| 2026-04-28 | Stream 1.2 — documentation only. The 2026-04-28 deep audit identified that 6 historic real trades (Apr 21 era, pre-tokenomics-v2 lock) have inconsistent fee_earnings rows: 1 trade with zero fee rows, 2 trades with platform-only (no holder/auto_buy/creator), 4 with 3 rows (no creator on a non-creator market — correct). Total impact ~$5 across $44 of real trade volume. No money lost — every real trade was on-chain verified, platform DESO inflows were correct; only the off-chain accounting ledger was incomplete during the early code path. Fee_earnings is authoritative for solvency/treasury computation from 2026-04-21 forward (the tokenomics-v2 lock date). Pre-v2 trades are NOT backfilled by design — reverse-engineering "what v2 should have written" for $5 of test volume is not worth the risk of corrupting current state. Historical-only, not an active bug. The treasury dashboard (Stream 2) and reconciliation infrastructure (Phase 4 + HRV) all operate on post-v2 data and are unaffected. No new audit finding IDs. | (no commits — historical documentation only) |

---

*End of AUDIT_MONEY_FLOWS.md.*
*Phase 1 complete. Phase 2 begins with P2-1 (auth middleware).*
