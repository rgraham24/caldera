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

#### SELL-3: `payout_tx_hash` is not persisted (P0)

- **Evidence:** The DeSo submit-transaction response contains a `TxnHashHex` (the on-chain tx hash of the platform's payout). This value is used only in the local function scope and is never written to any DB table. No `payout_tx_hash` column exists on `trades` or anywhere else.
- **Impact:** Zero on-chain verifiability for any sell payout. Cannot answer "did user X actually receive their sell proceeds?" without digging through Vercel logs (which rotate). Parallel to the `fee_earnings.tx_hash` gap we fixed in Step 3d.1 for auto-buys — sell flow is missing the same feature.
- **Severity:** P0 launch blocker. Even if SELL-2 is fixed, without persisting tx_hash we can't audit sell payouts.
- **Fix:** Add `payout_tx_hash`, `payout_status`, `payout_at`, `payout_failed_reason` columns to `trades` via migration. On successful DeSo send, write `payout_tx_hash` and status='paid'. On failure, write status='failed' with reason.

### 🟡 Concerns

#### SELL-4: Position update happens BEFORE payment attempt

- **Evidence:** Sequence in the sell route: positions update → trades insert → DeSo payout (tried).
- **Impact:** The wrong order for this flow. If the payout fails, the position is already closed — user has no retry option without manual intervention.
- **Fix:** Correct order (see Target behavior): insert sell trade with payout_status='pending' → attempt on-chain payout → on success, close position + update trade; on failure, update trade to 'failed', leave position open.
- **Note:** This fix is entwined with SELL-2's fix; they land together in the same branch.

#### SELL-5: No sell fees — correct per tokenomics, worth documenting

- **Evidence:** Sell route inserts `trades` rows with all `fee_*` fields set to 0.
- **Impact:** None — this is the correct behavior per 2026-04-21 tokenomics lock-in (sells are 0% fee). But the code actively writes zeroes rather than omitting the columns, which is a slight readability issue.
- **Fix:** Not a fix — verify the intent by making the zero-writes explicit with a comment referencing DECISIONS.md. No behavior change.

#### SELL-6: 10,000 nanos minimum floor (inconsistent with buy's 1000)

- **Evidence:** Sell route floors the computed payout nanos at 10000. Buy route / `lib/deso/buyback.ts` uses a floor of 1000.
- **Impact:** Minor. A user selling a position worth < ~$0.000047 wouldn't receive a payout. Probably never happens in real usage.
- **Fix:** Decide on a canonical floor (the 1000 nanos value from DeSo's native floor is the right choice) and apply consistently across both routes. Add as a shared constant in `lib/deso/transaction.ts` or similar.

#### SELL-7: Uses `node.deso.org` not `api.deso.org`

- **Evidence:** Sell route's on-chain calls go to `node.deso.org`; buy's go to `api.deso.org`.
- **Impact:** Usually harmless — both resolve to DeSo's infrastructure. But if one's load-balanced differently or one gets deprecated, only one route breaks. Maintenance hazard.
- **Fix:** Canonicalize on `api.deso.org` via the shared `DESO_API_BASE` constant from `lib/deso/rate.ts`. Already done for new code; sell route needs migrating.

#### SELL-8: Unused fields on positions table

- **Evidence:** Positions table has `deso_staked_nanos` and `txn_hash` columns that are always null. Never written. Possibly dead from an earlier architecture.
- **Impact:** None functionally. Schema clutter. Could also be confusing — "is this meant to be populated?"
- **Fix:** Either drop in a migration or document in a comment on the table what they're for / why they exist. Low priority.

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

<!-- Path 3 — Market Resolution -->
<!-- Path 3 — Market Resolution -->
<!-- Path 4 — Holder Rewards Claim -->
<!-- Path 5 — Creator Profile Claim -->
<!-- Cross-cutting concerns -->
<!-- Prioritized fix list -->
<!-- Open questions -->
<!-- Changelog -->
