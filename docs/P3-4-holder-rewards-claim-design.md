# P3-4 Design — Holder Rewards Claim Flow

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-4-holder-rewards-claim`
**Base commit:** a24bdb1 (P2-6 merge on main)
**Closes:** REWARDS-1 (P0), REWARDS-2 (P0), REWARDS-5 from
AUDIT_MONEY_FLOWS.md.

---

## Problem

The 0.5% holder rewards slice from every buy accrues into
`holder_rewards` rows correctly (Step 3c shipped 2026-04-23). As of
2026-04-26 there are **350 pending rows, $0.02 USD total, 88 distinct
(holder, token_slug) pairs, all on `bitcoin` token**.

But there is NO claim mechanism. Holders cannot get paid. The
audit's REWARDS-1 (P0) finding states:

> Claim mechanism does not exist. 350 rows pending, no route, no UI,
> no status transition.

REWARDS-2 (P0) compounds: Footer.tsx and terms/page.tsx promise
holder rewards as a feature, but the feature doesn't actually pay
anyone. Marketing fiction.

P3-4 builds the claim flow end to end:
- Backend route to aggregate pending rewards per (holder, token)
- Backend route to execute the claim (on-chain transfer + ledger)
- Frontend section on `/portfolio` showing pending rewards + claim
  buttons

---

## Locked decisions (from memory + audit)

- **Pull-based** (memory #13). Holder clicks button, server
  responds. No automatic push.
- **Pay in creator coins, not DESO** (memory #13). Closes the
  tokenomics loop with the auto-buy pool from Step 3d.
- **Per-token atomicity** (audit Path 4). One on-chain transfer per
  (holder, token) pair. Claims for different tokens are independent.
- **Liability-Ledger pattern** (memory #11). Status transitions
  pending → paid/failed; tx_hash stored; never zero or delete rows.
- **Compute price at claim time** (this design). Don't depend on
  whether `amount_creator_coin_nanos` column was populated at
  accrual; always compute fresh from current price.

---

## API surface

### `GET /api/holder-rewards/balance`

Returns pending rewards for the authenticated holder, grouped by
token.

```ts
// Response shape
type Response = {
  pending: Array<{
    tokenSlug: string;        // "bitcoin", "caldera-sports", etc.
    tokenType: "crypto" | "creator" | "category";
    displayLabel: string;     // "$bitcoin", "$CalderaSports"
    rowCount: number;
    totalUsd: string;         // "0.00927301" (decimal preserved)
    creatorPublicKey: string | null; // null if creator profile not yet provisioned
  }>;
};
```

Auth: session cookie via P2-1 middleware. 401 if missing.
Empty result → `{ pending: [] }`. Not a 404.

### `POST /api/holder-rewards/claim`

Executes a claim for ONE token. Body:

```ts
type Request = {
  tokenSlug: string;  // user picked from /balance response
};
```

Flow:

```
1. Auth (P2-1 middleware) → desoPublicKey
   ↓ missing → 401

2. Rate limit (P2-3) — bucket "rewards-claim:{publicKey}"
   ↓ over budget → 429

3. Validate body with Zod
   ↓ malformed → 400

4. Resolve creator pubkey for tokenSlug
   SELECT deso_public_key FROM creators WHERE slug = $tokenSlug
   ↓ not found / null → 404 "token-not-claimable"

5. Load pending rows
   SELECT * FROM holder_rewards
   WHERE holder_deso_public_key = $authedPubKey
     AND token_slug = $tokenSlug
     AND status = 'pending'
   ↓ zero rows → 404 "no-pending-rewards"

6. Compute totals
   sumUsd = SUM(amount_usd)
   priceUsdPerCoin = await getCreatorCoinData(creatorUsername).priceUSD
   ↓ priceUsdPerCoin <= 0 → 503 "price-fetch-failed"

7. Compute nanos
   coinAmount = sumUsd / priceUsdPerCoin
   coinNanos = BigInt(Math.floor(coinAmount * 1e9))
   ↓ coinNanos < 1n → 400 "amount-too-small"

8. Solvency preflight (P2-6)
   checkCreatorCoinSolvency(PLATFORM, creatorPubKey, coinNanos)
   ↓ insufficient → UPDATE rows status='blocked_insolvent';
                    return 503 "platform-insufficient-funds"

9. Pessimistic lock — atomically claim the rows
   UPDATE holder_rewards
     SET status = 'in_flight'
   WHERE id = ANY($rowIds) AND status = 'pending'
   RETURNING id;
   ↓ rowsUpdated < expected → 409 "concurrent-claim-attempt"

10. On-chain transfer (P2-4)
    transferCreatorCoin({
      creatorPublicKey, recipientPublicKey: authedPubKey,
      creatorCoinNanos: coinNanos,
      platformPublicKey, platformSeed
    })
    ↓ ok → UPDATE rows SET status='claimed',
            claimed_tx_hash=txHashHex, claimed_at=now(),
            amount_creator_coin_nanos=<per-row pro-rata of coinNanos>
            WHERE id = ANY($rowIds);
            return 200 { txHashHex, claimedUsd, claimedNanos }
    ↓ fail → UPDATE rows SET status='failed' WHERE id = ANY($rowIds);
             return 500 { reason }
```

### Failure modes

All failure paths leave the ledger in a recoverable state. Rows
either stay `pending` (rate-limited, malformed body, no rewards),
become `blocked_insolvent` (platform short on funds — admin
intervenes), or become `failed` (on-chain rejection — admin can
manually retry by resetting to `pending`).

**Critical invariant:** Rows reach `claimed` ONLY after on-chain
confirmation. If the server crashes between step 9 (`in_flight`)
and step 10 completion, rows are stuck `in_flight`. P4
reconciliation tooling will sweep these — out of P3-4 scope.

---

## Database changes

### Migration P3-4.2: Update status CHECK constraint

Current allowed: `'pending'` (default).
New allowed: `'pending' | 'in_flight' | 'claimed' | 'failed' | 'blocked_insolvent' | 'abandoned'`

```sql
ALTER TABLE holder_rewards DROP CONSTRAINT IF EXISTS holder_rewards_status_check;
ALTER TABLE holder_rewards ADD CONSTRAINT holder_rewards_status_check
  CHECK (status IN ('pending', 'in_flight', 'claimed', 'failed', 'blocked_insolvent', 'abandoned'));
```

(If the constraint name is different in production, P3-4.2 will
detect and adapt.)

### Migration P3-4.2: Index for claim-time queries

The claim path queries by `(holder_deso_public_key, token_slug, status)`. Existing
`idx_holder_rewards_holder_status` covers `(holder, status)` but not
the token. Add:

```sql
CREATE INDEX IF NOT EXISTS idx_holder_rewards_holder_token_status
  ON holder_rewards (holder_deso_public_key, token_slug, status);
```

This index is the hot path for both `/balance` (group-by) and
`/claim` (filter).

### SQL view: `v_holder_rewards_pending_by_user`

For the `/balance` endpoint:

```sql
CREATE OR REPLACE VIEW v_holder_rewards_pending_by_user AS
SELECT
  hr.holder_deso_public_key,
  hr.token_slug,
  hr.token_type,
  COUNT(*)         AS row_count,
  SUM(hr.amount_usd)::text AS total_usd
FROM holder_rewards hr
WHERE hr.status = 'pending'
GROUP BY hr.holder_deso_public_key, hr.token_slug, hr.token_type;
```

API just queries this view + joins with `creators` for display
metadata.

---

## Frontend

### Where rewards UI lives

`/portfolio` page already exists for positions + coin holdings.
Add a "Rewards" section above (or as a tab). Implementation in
P3-4.5.

### UX

```
─────────────────────────────────────────────
  💰 Pending Rewards
─────────────────────────────────────────────
  $0.0093 in $bitcoin     [ Claim ]
  $0.0021 in $CalderaSports [ Claim ]

  Rewards are paid in creator coins, not DESO.
─────────────────────────────────────────────
```

Click "Claim" → spinner → success message with tx hash link to
DeSo explorer.

REWARDS-6 hint: copy clearly states "creator coins, not DESO."

---

## Test strategy

### Unit tests (P3-4.3 + .4)

Mock the entire route dependency chain:
- `getAuthenticatedUser` (mock authed user)
- `supabase.from('holder_rewards').select(...)` etc.
- `getCreatorCoinData` (return fixed price)
- `checkCreatorCoinSolvency` (mock ok or insufficient)
- `transferCreatorCoin` (mock success or failure)

Cover every branch in the flow above:
- Auth missing → 401
- Rate limit hit → 429
- Malformed body → 400
- Token slug not in creators table → 404
- Zero pending rows → 404
- Price fetch fails → 503
- Computed nanos = 0 → 400
- Insolvent → 503 + rows marked blocked_insolvent
- Concurrent claim race → 409
- transferCreatorCoin fails → 500 + rows marked failed
- Happy path → 200 + rows marked claimed + tx hash returned

### E2E validation post-merge

Real claim with real wallet:
1. Log in as one of the 88 holders (impersonation in dev OR pick a
   wallet you control that has accrued rewards)
2. GET /api/holder-rewards/balance → returns the holder's bitcoin row
3. POST /api/holder-rewards/claim with `{ tokenSlug: "bitcoin" }`
4. Verify on-chain transfer of $bitcoin nanos to that wallet
5. Verify holder_rewards rows transitioned to `claimed`

If you don't have a holder wallet, simulation alternative: insert
synthetic rows for a wallet you control, run claim against it,
verify.

This is the FIRST real validation of P2-4's `transferCreatorCoin`
in production. Worth doing carefully.

---

## Sub-commit sequence (6)

| Commit | Content |
|--------|---------|
| P3-4.1 | This design doc |
| P3-4.2 | DB migration (status CHECK + index + view) |
| P3-4.3 | `GET /api/holder-rewards/balance` route + tests |
| P3-4.4 | `POST /api/holder-rewards/claim` route + tests |
| P3-4.5 | Frontend: portfolio page rewards section |
| P3-4.6 | Audit changelog: REWARDS-1, REWARDS-2, REWARDS-5 → Resolved |

---

## Out of P3-4 scope

- **REWARDS-7** (column population in holderSnapshot.ts at accrual
  time) — separate hygiene fix; design doesn't depend on it
- **REWARDS-4** (5 stale auto_buy_pool rows from pre-v2) — hygiene
- **Reconciliation tooling** for stuck `in_flight` rows — Phase 4
- **Email/push notifications** when rewards accrue — future
- **Claim history page** — future
- **Bulk "claim all" button** — future (per-token is simpler MVP)

---

## Dependencies

- `lib/deso/transfer.ts` (P2-4) — on-chain creator-coin transfer
- `lib/deso/solvency.ts` (P2-6) — solvency preflight
- `lib/deso/api.ts::getCreatorCoinData` — price lookup
- `lib/auth/index.ts::getAuthenticatedUser` (P2-1) — session cookie
  identity
- `lib/rate-limit/index.ts` (P2-3) — abuse protection
- Supabase server client — DB
- Existing `creators` table for token_slug → deso_public_key

No new npm deps.

---

## Open questions

### OQ-1: Per-row `amount_creator_coin_nanos` allocation on success

After successful transfer, we mark each row `claimed`. But the
`amount_creator_coin_nanos` for each individual row is a fraction
of the total. We can either:
- Pro-rate: row's USD share / total USD × total coin nanos
- Leave NULL: keep the column null on legacy rows; only populate
  on accrual going forward (REWARDS-7 fix)

**Decision:** Pro-rate at claim time. Each row gets
`row.amount_usd / sum_amount_usd * total_coin_nanos`. This makes
historical reporting accurate without depending on REWARDS-7.

### OQ-2: What about the 5 stale auto_buy_pool rows (REWARDS-4)?

They're in `fee_earnings`, not `holder_rewards`. Different table.
Out of P3-4 scope. Hygiene fix later.

### OQ-3: Should `/balance` show ZERO-rewarded tokens?

No. Only return tokens with at least one pending row. Empty
response if user has no pending rewards.

### OQ-4: Which rate limit config — `trades` or new `rewards-claim`?

Use existing `trades` config (10/60s). Same money-route class. No
need for a new bucket. Bucket key prefix `rewards-claim:` keeps it
distinct from `trades:` and `sell:` budgets.

### OQ-5: What if the holder doesn't have a session cookie but has rewards?

They can't claim until they log in. The 88 distinct holders are
identified by DeSo public key — they need to authenticate as that
key (via DeSo Identity) before claim. No anonymous claims.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc created. Audit's Path 4 spec adopted nearly verbatim. Compute-price-at-claim-time strategy locked over relying on amount_creator_coin_nanos column. |
