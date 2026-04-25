# P3-5 Design — Creator Claim Payout Flow

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-5-creator-claim`
**Base commit:** de07789 (P3-4 merge on main)
**Closes:** CLAIM-1 (P0), CLAIM-3 (P1), CLAIM-7 (P1) from
AUDIT_MONEY_FLOWS.md. Notes CLAIM-2 fully closed. CLAIM-5 separate.

---

## Problem

The current creator claim flow corrupts the ledger.

`app/api/creators/[slug]/claim/route.ts` and
`app/api/creators/[slug]/verify-claim/route.ts` both execute:

```sql
UPDATE creators SET
  unclaimed_earnings_escrow = 0,
  total_creator_earnings = (prev) + (escrow at claim time)
WHERE slug = $slug;
```

with **zero on-chain DESO transfer** to the creator. The creator's
profile shows "claimed" status, escrow shows zero, but no money
ever left the platform wallet. The creator's wallet does not
receive the funds. From the creator's perspective: the system
silently lost their earnings.

This is the worst kind of money bug. The user harmed wouldn't know
to complain — they'd just see $0 and assume that's correct.

There are also redundant claim routes:
- `app/api/creators/claim/route.ts` — legacy stub, no DESO send,
  TODO marker, anon RLS client. Zero callers (verified). Safe to
  delete.
- `app/api/creators/[slug]/claim/route.ts` — canonical, P2-5
  Fresh-JWT applied. Will be the single endpoint after P3-5.

P3-5 builds the safe creator claim flow end-to-end:
- New primitive `lib/deso/transferDeso.ts` for native DESO sends
- Append-only `creator_claim_payouts` audit table
- Atomic ledger pattern: zero escrow ONLY after on-chain confirmed
- Idempotency: prevent double-claim races
- Frontend: "Claim earnings" button on the creator's own profile

---

## Locked decisions (from memory + audit)

- **Pull-based** (memory #14). Creator clicks button, server responds.
- **Pay DESO, not creator coins** (memory #14). Creators want DESO.
- **Append-only audit ledger** (memory #14). New table
  `creator_claim_payouts`, never zero or delete rows.
- **Zero escrow ONLY after on-chain send confirmed** (memory #11).
- **Fresh-JWT required** (memory #15, OQ-1). High-value operation.
- **Liability-Ledger pattern** (memory #11). Status transitions
  pending → in_flight → claimed | failed.
- **Per-creator atomicity** (audit). One claim = one DESO send.
  No batching across creators.
- **Pessimistic lock via DB UNIQUE constraint** to enforce
  idempotency (CLAIM-7).

---

## API surface

### `POST /api/creators/[slug]/claim` (CANONICAL — already P2-5
secured for auth, body is currently empty stub)

Body (existing P2-5 contract):

```ts
type Request = {
  jwt: string;        // Fresh DeSo JWT (iat within 60s)
};
```

Auth flow (already P2-5 wired):
1. P2-1 cookie auth → desoPublicKey
2. P2-5 fresh-JWT verify → confirms desoPublicKey owns the key
   that signed within last 60s

P3-5 adds the money path BELOW the auth gate.

```
1. Auth (already done by P2-1 + P2-5)
   ↓ missing → 401

2. Rate limit (P2-3) — bucket "creator-claim:{publicKey}"
   ↓ over budget → 429

3. Load creator row by slug
   SELECT slug, deso_public_key, claim_status,
          unclaimed_earnings_escrow, claimed_at
   FROM creators WHERE slug = $slug
   ↓ not found → 404

4. Authorization check
   creator.deso_public_key === authedDesoPublicKey
   ↓ mismatch → 403 "not-claimer"

5. Validate state
   creator.claim_status === 'claimed'
     AND creator.unclaimed_earnings_escrow > 0
   ↓ unclaimed creator → 400 "profile-not-claimed"
   ↓ zero balance → 400 "no-balance"

6. Idempotency check (CLAIM-7)
   SELECT 1 FROM creator_claim_payouts
   WHERE creator_id = $creatorId
     AND status IN ('pending', 'in_flight')
   ↓ exists → 409 "claim-in-progress"

7. Compute payout amount in DESO nanos
   priceUsdPerDeso = await getDesoPrice()
   escrowUsd = creator.unclaimed_earnings_escrow
   amountNanos = BigInt(Math.floor((escrowUsd / priceUsdPerDeso) * 1e9))
   ↓ amountNanos < 10_000n → 400 "amount-too-small"
     (~$0.00005 at $5/DESO; below DeSo's network fee ~168 nanos
      but lets users claim small amounts)

8. Solvency preflight (P2-6)
   checkDesoSolvency(PLATFORM, amountNanos)
   ↓ insufficient → 503 "platform-insufficient-funds"
     (no row insert needed — nothing yet committed)
   ↓ fetch-failed → 503 "solvency-fetch-failed"

9. Insert audit row (status: in_flight)
   INSERT INTO creator_claim_payouts (
     creator_id, slug,
     recipient_deso_public_key,
     escrow_amount_at_claim_usd,
     amount_nanos,
     deso_usd_rate_at_claim,
     status, created_at
   ) VALUES (..., 'in_flight', NOW())
   RETURNING id;

   UNIQUE constraint on (creator_id, status)
     WHERE status IN ('pending', 'in_flight') ensures no
     concurrent claim races slip through gate 6.
   ↓ unique violation → 409 "claim-in-progress"
   ↓ other db error → 500 "audit-row-insert-failed"

10. On-chain DESO transfer
    transferDeso({
      recipientPublicKey: authedPubKey,
      amountNanos,
      platformPublicKey,
      platformSeed
    })
    ↓ ok → step 11
    ↓ fail → UPDATE creator_claim_payouts SET status='failed',
              error_reason=<reason>, completed_at=NOW()
              WHERE id = $auditId;
              return 500 { reason }
    Escrow is NEVER touched on failure path.

11. Mark claimed (atomic transaction)
    BEGIN;
    UPDATE creators
      SET unclaimed_earnings_escrow = 0,
          claimed_at = COALESCE(claimed_at, NOW()),
          total_creator_earnings = total_creator_earnings + escrowUsd
      WHERE id = $creatorId;
    UPDATE creator_claim_payouts
      SET status = 'claimed',
          tx_hash = $txHashHex,
          completed_at = NOW()
      WHERE id = $auditId;
    COMMIT;
    ↓ db update fails AFTER on-chain send →
      log CRITICAL ledger-update-failed (tx is on-chain, escrow
      and audit row may be inconsistent — Phase 4 reconciliation
      sweeps);
      return 500 { reason: "ledger-update-failed", txHashHex }

12. Success
    Return 200 {
      ok: true, txHashHex, amountNanos, escrowUsd, slug
    }
```

### Failure modes summary

| Gate | Failure | Audit row state | Escrow state |
|------|---------|-----------------|--------------|
| 1-8  | (various)        | none created          | unchanged    |
| 9    | unique violation | (existing in_flight)  | unchanged    |
| 10   | transfer failed  | failed                | unchanged    |
| 11   | db update failed | in_flight (orphaned)  | corrupt risk |

The "in_flight orphan" case is handled by Phase 4 reconciliation:
the tx hash is logged to console.error and re-readable by walking
the audit table for in_flight rows older than N minutes.

---

## Database changes

### Migration P3-5.2: Create `creator_claim_payouts` audit table

```sql
CREATE TABLE creator_claim_payouts (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id                      UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  slug                            TEXT NOT NULL,
  recipient_deso_public_key       TEXT NOT NULL,
  escrow_amount_at_claim_usd      NUMERIC(20,8) NOT NULL,
  amount_nanos                    BIGINT NOT NULL,
  deso_usd_rate_at_claim          NUMERIC(20,8) NOT NULL,
  status                          TEXT NOT NULL CHECK (status IN
                                    ('pending', 'in_flight', 'claimed',
                                     'failed', 'blocked_insolvent')),
  tx_hash                         TEXT,
  error_reason                    TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                    TIMESTAMPTZ
);

-- Idempotency: only ONE active (pending or in_flight) claim per creator
CREATE UNIQUE INDEX uq_creator_claim_payouts_active
  ON creator_claim_payouts (creator_id)
  WHERE status IN ('pending', 'in_flight');

-- Hot path: lookup by slug for /balance-style queries
CREATE INDEX idx_creator_claim_payouts_slug_status
  ON creator_claim_payouts (slug, status, created_at DESC);

-- Audit trail: all claims for a creator, recent first
CREATE INDEX idx_creator_claim_payouts_creator_recent
  ON creator_claim_payouts (creator_id, created_at DESC);
```

The partial UNIQUE index is the linchpin of CLAIM-7. Two
concurrent INSERTs with status='in_flight' for the same
creator_id will fail with constraint violation; the route catches
this and returns 409.

---

## Module additions

### `lib/deso/transferDeso.ts` (new primitive — P3-5.3)

Same shape as `lib/deso/transfer.ts` (P2-4) but for native DESO,
not creator coins. Tagged result.

```ts
export type TransferDesoParams = {
  recipientPublicKey: string;
  amountNanos: bigint;
  platformPublicKey: string;
  platformSeed: string;
};

export type TransferDesoResult =
  | { ok: true; txHashHex: string; feeNanos: bigint }
  | { ok: false; reason: 'build-failed' | 'submit-failed'; detail: string };

export async function transferDeso(params: TransferDesoParams):
  Promise<TransferDesoResult> {
  // 1. POST https://api.deso.org/api/v0/send-deso with
  //    { SenderPublicKeyBase58Check, RecipientPublicKeyOrUsername,
  //      AmountNanos, MinFeeRateNanosPerKB: 1000 }
  //    → TransactionHex (string)
  // 2. signAndSubmit(txHex, platformSeed)
  //    → SignAndSubmitResult { success, txHashHex, error }
  // 3. Return tagged result
}
```

Pattern identical to buyback.ts (build → sign+submit). Fail-closed
on network errors. Same test shape as P2-4.

---

## Frontend

### Where the "Claim earnings" button lives

Creator profile page already exists at
`app/(main)/creators/[slug]/creator-profile-client.tsx`.

It already has an "unclaimed earnings claim banner" for
verification_status='approved' && claim_status!='claimed'
(this is the SHADOW-PROFILE claim flow — different from earnings
withdrawal).

P3-5.6 adds a SECOND surface: "Claim earnings" button visible only
when ALL of:
- `claim_status === 'claimed'` (profile already owned)
- `unclaimed_earnings_escrow > 0`
- Logged-in user's `desoPublicKey === creator.deso_public_key`
- `verifyDesoSession()` available (cookie + fresh-JWT)

Click flow:
1. Trigger fresh-JWT prompt via `getDesoIdentity().jwt()`
2. POST /api/creators/[slug]/claim with `{ jwt }`
3. On success: persistent banner (same UX pattern as P3-4.7)
   showing "✓ Claimed $X · view tx"
4. On failure: friendly error message keyed off `reason`

UX text: "$0.015 in earnings ready to withdraw. Claim → DESO sent
to your wallet."

Accessibility: only the OWNER sees this UI. Anyone else viewing
the profile sees the regular profile, no withdrawal surface.

---

## Test strategy

### Unit tests

**P3-5.3 (transferDeso.ts):**
- Happy path: build returns hex, signAndSubmit succeeds → ok with txHashHex
- Build fails (HTTP 500 from DeSo) → reason: build-failed
- signAndSubmit fails → reason: submit-failed
- Network error during build → reason: build-failed (fail-closed)

**P3-5.5 (claim route):**
Mock the dependency chain. Cover every gate:
- 401 missing cookie / 401 invalid jwt
- 429 rate limit
- 404 slug not found
- 403 caller is not the claimer
- 400 profile-not-claimed
- 400 no-balance
- 409 claim-in-progress (active row exists)
- 400 amount-too-small
- 503 insolvent
- 500 transfer failed → audit row marked failed, escrow untouched
- 200 happy path → audit row claimed, escrow zeroed, total bumped
- 500 ledger-update-failed → tx hash logged, partial state warned

### E2E validation post-merge

Real claim with synthetic data:
1. Pick a test creator (slug + deso_public_key = wallet you control)
2. Insert a pre-existing creator row OR seed one with controlled
   slug + desired escrow amount
3. Insert escrow value: e.g. update creators set
   unclaimed_earnings_escrow = 0.001, claim_status = 'claimed',
   deso_public_key = '<your wallet>' where slug = '<test slug>'
4. Visit /creators/[slug] logged in as that wallet
5. See "Claim earnings $0.001" button
6. Click → success banner appears, tx hash visible
7. Verify on-chain DESO transfer to your wallet
8. Verify in DB:
   - creators row: escrow=0, total_creator_earnings += 0.001
   - creator_claim_payouts row: status='claimed', tx_hash set
9. Try clicking again: should see no button (escrow=0)
   OR if no button hides, button click → 400 "no-balance"

E2E plan documented in P3-5 design doc; same pattern as P3-4.

---

## Sub-commit sequence (7)

| Commit | Content |
|--------|---------|
| P3-5.1 | This design doc |
| P3-5.2 | DB migration: creator_claim_payouts + indexes |
| P3-5.3 | lib/deso/transferDeso.ts + tests |
| P3-5.4 | Delete legacy stub app/api/creators/claim/route.ts |
| P3-5.5 | Implement canonical [slug]/claim body + tests |
| P3-5.6 | Frontend: claim earnings button on creator profile |
| P3-5.7 | Audit changelog updates |

---

## Out of P3-5 scope

- **CLAIM-5** (lying-aggregate column): replacing
  `total_creator_earnings` with a view over creator_claim_payouts.
  Hygiene fix; out of scope. P3-5.5 will keep updating the column
  for now (less disruption).
- **CLAIM-6** (tweet/URL verification brittleness): defer.
- **Reconciliation tooling** for stuck in_flight rows: Phase 4.
- **Email/push notifications** for "your earnings are ready":
  future.
- **Automatic claim scheduling**: pull-based per memory #14.
- **Bulk claim across creators** (one user owning multiple
  profiles): not anticipated demand. Add only if real users
  request.

---

## Dependencies

- `lib/deso/transferDeso.ts` (NEW, P3-5.3) — DESO native transfer
- `lib/deso/solvency.ts::checkDesoSolvency` (P2-6) — preflight
- `lib/auth/index.ts::getAuthenticatedUser` (P2-1) — session
- `lib/auth/fresh-jwt.ts::verifyFreshDesoJwt` (P2-5) — high-value
  ops auth
- `lib/rate-limit/index.ts` (P2-3) — abuse protection
- `lib/deso/api.ts::getDesoPrice` (existing) — USD conversion
- `lib/deso/transaction.ts::signAndSubmit` (existing) — tx submit
- Supabase service-role client (lessons from P3-4)
- Existing `creators` table

No new npm deps.

---

## Open questions

### OQ-1: Should we also drop the `total_creator_earnings` column?

CLAIM-5 says yes (lying aggregate). P3-5 keeps it for now,
populated atomically as part of the claim transaction in step 11.
If we drop later, the audit table is the source of truth; a view
can be added.

**Decision: keep, populate atomically. Out of scope to drop.**

### OQ-2: What about the verify-claim and tweet-verify routes?

These do shadow-profile verification (the public claim flow), not
earnings withdrawal. They use createClient (anon) and have no
fresh-JWT. They're separate from CLAIM-1 the money path; closing
CLAIM-1 doesn't require touching them.

**Decision: leave alone for P3-5. Hygiene fix later.**

### OQ-3: Should the existing canonical route accept a body?

P2-5 currently accepts `{ jwt }` only. P3-5 keeps that contract.
No tweetUrl, no code, no signedNonce — those belong to the SHADOW
PROFILE CLAIM flow (verify-claim), not earnings withdrawal.

This is a cleaner separation than the audit's original spec
suggested. The "claim a profile" flow and the "claim accrued
earnings" flow are now distinct logical operations even if they
share the same shadow profile claim_status.

**Decision: body is just `{ jwt }`. Earnings claim is for
already-claimed profiles only (gate 5 enforces).**

### OQ-4: Atomic transaction for step 11 — how?

Supabase JS client doesn't expose explicit transactions. Options:
- Postgres function (RPC): wrap UPDATEs in a stored procedure
- Two-phase client-side: sequential UPDATEs with rollback logic

**Decision: Postgres RPC.** Cleaner atomicity, mirrors what audit
called "P2-7 atomic RPC". Define `mark_creator_claim_complete(...)`
in the migration; route calls via `.rpc()`.

### OQ-5: What if creator's `deso_public_key` changes after profile claim?

Current schema allows it but it shouldn't happen in practice. P3-5
gate 4 reads `creator.deso_public_key` at claim time and compares
to `authedDesoPublicKey`. A mismatch returns 403, even if the
old key once owned this profile. This is correct — only the
current owner can withdraw.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc. Ledger pattern with atomic RPC mark_creator_claim_complete. transferDeso primitive added as P3-5.3. Legacy stub deletion as P3-5.4 (closes CLAIM-3 partially). Out-of-scope items: CLAIM-5, CLAIM-6, reconciliation tooling. |
