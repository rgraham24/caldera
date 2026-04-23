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
<!-- Path 1 — Buy Flow (coming next session) -->
<!-- Path 2 — Sell Flow -->
<!-- Path 3 — Market Resolution -->
<!-- Path 4 — Holder Rewards Claim -->
<!-- Path 5 — Creator Profile Claim -->
<!-- Cross-cutting concerns -->
<!-- Prioritized fix list -->
<!-- Open questions -->
<!-- Changelog -->
