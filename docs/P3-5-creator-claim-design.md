# P3-5 Design — Creator Claim Payout Flow

**Status:** Approved, ready to implement.
**Branch:** `feat/p3-5-creator-claim`
**Base commit:** de07789 (P3-4 merge on main)
**Closes:** CLAIM-1 (P0), CLAIM-3 (P1), CLAIM-7 (P1) from
AUDIT_MONEY_FLOWS.md. Notes CLAIM-2 fully closed. CLAIM-5 separate.

**Revision history:**
- v1 (2026-04-26 morning): earnings-only design assuming profile
  claim happens via separate route.
- v2 (2026-04-26 afternoon): combined flow. Pre-implementation
  research revealed (a) the existing canonical route IS the
  shadow-profile-claim flow with the CLAIM-1 corruption inline,
  and (b) the viral hook implies a single-click moment. P3-5.5
  now handles BOTH profile claim and earnings payout atomically.

---

## Problem

The current canonical creator claim route (`app/api/creators/[slug]/claim/route.ts`)
does shadow-profile-claim — flipping `tier` from `'unclaimed'` to
`'verified_creator'` once a creator proves ownership of the profile
via tweet/URL verification. As part of that flow, it ALSO:

```sql
UPDATE creators SET
  tier                       = 'verified_creator',
  claimed_at                 = NOW(),
  deso_public_key            = $body.desoPublicKey,
  total_creator_earnings     = (prev) + (escrow_at_claim_time),
  unclaimed_earnings_escrow  = 0
WHERE slug = $slug;
```

with **zero on-chain DESO transfer** to the creator. CLAIM-1.

This is the worst kind of money bug: silent loss. From the
creator's perspective, the system says "claimed" but no DESO ever
arrives in their wallet.

The legacy stub `/api/creators/claim` (no slug) had similar issues
plus broken auth. Already deleted in P3-5.4.

P3-5 builds the safe combined flow:
- Profile claim transition (shadow → verified) in atomic transaction
- DESO send via P3-5.3's transferDeso primitive
- Append-only audit ledger
- Idempotency via partial UNIQUE index
- Frontend "Claim earnings" button on creator profile

---

## Locked decisions

- **Pull-based**: creator clicks button, server responds. No push.
- **Pay DESO, not creator coins**: creators want DESO.
- **Combined flow** (v2 update): one route handles profile claim
  + earnings payout atomically when both apply.
- **Append-only audit ledger** (`creator_claim_payouts`).
- **Zero escrow ONLY after on-chain confirmed**.
- **Fresh-JWT required** (P2-5).
- **Per-creator atomicity**.
- **Idempotency via DB UNIQUE constraint** on
  `(creator_id) WHERE status IN ('pending', 'in_flight')`.

---

## API surface

### `POST /api/creators/[slug]/claim` (CANONICAL — already P2-5 secured)

Body (existing P2-5 contract — uses `desoJwt` not `jwt`):

```ts
type Request = {
  desoJwt: string; // Fresh DeSo JWT (iat within 60s)
};
```

Auth flow (already P2-5 wired, KEEP AS-IS):
1. P2-1 cookie auth → desoPublicKey
2. P2-5 fresh-JWT verify → confirms desoPublicKey owns the key
   that signed within last 60s

P3-5.5 REPLACES the route body BELOW the auth gate.

### Decision matrix

The route handles three cases distinguishable by creator state:

| State | claim_status | escrow > 0 | Action |
|-------|--------------|------------|--------|
| First-time claim with money | `'unclaimed'` | yes | profile claim + DESO send |
| Profile claim, empty profile | `'unclaimed'` | no | profile claim only (no money path) |
| Repeat earnings withdrawal | `'claimed'` | yes | DESO send only |
| Already claimed, no money | `'claimed'` | no | 400 `no-balance` |

For the third case, the user already owns the profile and just wants
to collect new earnings. For the first case (first-time claim with
money), we run the profile claim AND the DESO payout atomically.

### Required pre-state (from verify-claim flow)

For an unclaimed profile to transition to claimed via this route:
- `creator.verification_status === 'approved'` (set by verify-claim)
- `creator.tier === 'unclaimed'`
- The DeSo wallet attempting to claim must match
  `creator.claim_attempted_by` if set, OR the route accepts whoever
  authenticates with fresh-JWT. (verify-claim already set the
  intended claimant via the tweet code mechanism.)

If `verification_status` is not `'approved'` → 400
"profile-not-verified". The user should go through verify-claim
first.

### Full pipeline

```
1. Auth (P2-1 cookie + P2-5 fresh-JWT) — KEEP AS-IS
   ↓ missing/invalid → 401

2. Rate limit (P2-3) — bucket "creator-claim:{publicKey}"
   ↓ over budget → 429

3. Load creator row by slug (service-role client)
   SELECT id, slug, deso_public_key, tier, claim_status,
          verification_status, claim_attempted_by,
          unclaimed_earnings_escrow, claimed_at
   FROM creators WHERE slug = $slug
   ↓ not found → 404

4. State validation
   ↓ verification_status !== 'approved' → 400 "profile-not-verified"
   ↓ tier !== 'unclaimed' && claim_status !== 'claimed' → 400 "invalid-state"

5. Authorization check
   IF tier === 'unclaimed' (first-time path):
     - claim_attempted_by may be set; if so, must match authedPubKey
     - if claim_attempted_by NULL, allow (verify-claim's process should have constrained who can
       authenticate)
   IF claim_status === 'claimed' (repeat path):
     - creator.deso_public_key must equal authedPubKey
   ↓ mismatch → 403 "not-claimer"

6. Determine action mode
   isFirstTimeClaim = (tier === 'unclaimed')
   hasEscrow        = (unclaimed_earnings_escrow > 0)

7. Idempotency check (CLAIM-7) — only if hasEscrow
   SELECT 1 FROM creator_claim_payouts
   WHERE creator_id = $creatorId
     AND status IN ('pending', 'in_flight')
   ↓ exists → 409 "claim-in-progress"

8. Compute payout amount in DESO nanos (only if hasEscrow)
   priceUsdPerDeso = await fetchDesoUsdRate()
   ↓ null → 503 "price-fetch-failed"
   amountNanos = BigInt(Math.floor((escrowUsd / priceUsdPerDeso) * 1e9))
   ↓ amountNanos < 10_000n → 400 "amount-too-small"

9. Solvency preflight (P2-6) — only if hasEscrow
   checkDesoSolvency(PLATFORM, amountNanos)
   ↓ insufficient → 503 "platform-insufficient-funds"
   ↓ fetch-failed → 503 "solvency-fetch-failed"

10. Branch on hasEscrow:

    PATH A (hasEscrow = false): Profile-only claim
      Direct UPDATE on creators (no audit row, no on-chain send):
        UPDATE creators
          SET tier            = 'verified_creator',
              claim_status    = 'claimed',
              deso_public_key = $authedPubKey,
              claimed_at      = NOW()
          WHERE id = $creatorId AND tier = 'unclaimed';
        ↓ rowcount=0 → 409 "concurrent-claim-or-state-changed"
      Return 200 { ok: true, profileClaimed: true, txHashHex: null,
                   amountNanos: '0', escrowUsd: '0' }

    PATH B (hasEscrow = true): Money path

      11. Insert audit row (status: in_flight)
          INSERT INTO creator_claim_payouts (
            creator_id, slug, recipient_deso_public_key,
            escrow_amount_at_claim_usd, amount_nanos,
            deso_usd_rate_at_claim, status, created_at
          ) VALUES (..., 'in_flight', NOW())
          RETURNING id;
          ↓ unique violation (race) → 409 "claim-in-progress"
          ↓ other error → 500 "audit-row-insert-failed"

      12. On-chain DESO transfer (P3-5.3)
          transferDeso({ recipientPublicKey, amountNanos,
                         platformPublicKey, platformSeed })
          ↓ ok → step 13
          ↓ fail → UPDATE creator_claim_payouts SET
                     status='failed', error_reason=<reason>,
                     completed_at=NOW() WHERE id = $auditId;
                   return 500 { reason }
          Escrow is NEVER touched on failure path.

      13. Atomic ledger transition
          CALL mark_creator_claim_complete(
            p_audit_id           = $auditId,
            p_creator_id         = $creatorId,
            p_escrow_usd         = $escrowUsd,
            p_tx_hash            = $txHashHex,
            p_also_claim_profile = isFirstTimeClaim,
            p_recipient_pubkey   = $authedPubKey
          )

          The RPC (extended in P3-5.4b) wraps in a single transaction:
            - creators: zero escrow, bump total_creator_earnings,
              and IF p_also_claim_profile: set tier='verified_creator',
              claim_status='claimed', deso_public_key, claimed_at
            - audit row: status='claimed', tx_hash, completed_at

          ↓ RPC error → log CRITICAL ledger-update-failed
            (tx is on-chain; rows may be inconsistent — Phase 4 sweeps);
            return 500 { reason: "ledger-update-failed", txHashHex }

      14. Success
          Return 200 {
            ok: true,
            profileClaimed: isFirstTimeClaim,
            txHashHex,
            amountNanos: amountNanos.toString(),
            escrowUsd: escrowUsd.toFixed(8),
            slug
          }
```

### Failure modes summary

| Gate | Failure | Audit row | Escrow | Profile claim |
|------|---------|-----------|--------|---------------|
| 1-9  | (various)        | none          | unchanged | unchanged |
| 10A  | concurrent UPDATE | none          | unchanged | not transitioned |
| 11   | unique violation | (existing)    | unchanged | unchanged |
| 12   | transfer failed  | failed        | unchanged | unchanged |
| 13   | RPC failed       | in_flight     | risk      | risk      |

The "RPC failed after on-chain send" case is logged CRITICAL with
`txHashHex`, and Phase 4 reconciliation walks `in_flight` rows older
than N minutes.

---

## Database changes

### Migration P3-5.2 (already shipped, `878ecad`)
- `creator_claim_payouts` table created
- 3 indexes (incl. partial UNIQUE for idempotency)
- `mark_creator_claim_complete` RPC v1 (4 args: audit_id, creator_id, escrow_usd, tx_hash)

### Migration P3-5.4b (NEW — extends RPC)

The v1 RPC handled earnings-only transitions. v2 of the design
also needs to atomically handle the profile-claim transition for
first-time claimants.

CREATE OR REPLACE FUNCTION extended with two new params:

```sql
CREATE OR REPLACE FUNCTION mark_creator_claim_complete(
  p_audit_id            UUID,
  p_creator_id          UUID,
  p_escrow_usd          NUMERIC,
  p_tx_hash             TEXT,
  p_also_claim_profile  BOOLEAN DEFAULT FALSE,
  p_recipient_pubkey    TEXT    DEFAULT NULL
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  IF p_also_claim_profile THEN
    -- Combined: first-time claim with money. Update everything.
    IF p_recipient_pubkey IS NULL THEN
      RAISE EXCEPTION 'recipient-pubkey-required-for-profile-claim';
    END IF;

    UPDATE creators
      SET unclaimed_earnings_escrow = 0,
          total_creator_earnings    = COALESCE(total_creator_earnings, 0) + p_escrow_usd,
          tier                      = 'verified_creator',
          claim_status              = 'claimed',
          deso_public_key           = p_recipient_pubkey,
          claimed_at                = COALESCE(claimed_at, NOW())
      WHERE id   = p_creator_id
        AND tier = 'unclaimed';
  ELSE
    -- Repeat: already-claimed creator just collecting earnings.
    UPDATE creators
      SET unclaimed_earnings_escrow = 0,
          total_creator_earnings    = COALESCE(total_creator_earnings, 0) + p_escrow_usd,
          claimed_at                = COALESCE(claimed_at, NOW())
      WHERE id           = p_creator_id
        AND claim_status = 'claimed';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator-not-found-or-state-mismatch: %', p_creator_id;
  END IF;

  UPDATE creator_claim_payouts
    SET status        = 'claimed',
        tx_hash       = p_tx_hash,
        completed_at  = NOW()
    WHERE id     = p_audit_id
      AND status = 'in_flight';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit-row-not-in-flight: %', p_audit_id;
  END IF;
END;
$$;
```

Backwards compatible: existing 4-arg callers still work via the
`DEFAULT` values.

### What about Path A (profile-only, no money path)?

That's a direct UPDATE in route code. No RPC needed; no audit row;
no money to track. The route handles it inline with a guarded
UPDATE that fails if state already changed.

---

## Module additions

### `lib/deso/transferDeso.ts` (already shipped, `90eac5a`)
Native DESO transfer primitive. Tagged result. P3-5.5 consumes.

---

## Frontend

### Where the "Claim" button lives

Creator profile page at
`app/(main)/creators/[slug]/creator-profile-client.tsx` already has
an "unclaimed earnings claim banner" for verification_status='approved'
&& claim_status !== 'claimed'.

P3-5.6 wires that banner's CTA to the canonical claim route. The
button copy adapts to state:

| State | Button copy |
|-------|-------------|
| Unclaimed + escrow > 0 | "Claim profile and $X.XX" |
| Unclaimed + escrow = 0 | "Claim profile" |
| Claimed (own viewer) + escrow > 0 | "Withdraw $X.XX" |
| Claimed (own viewer) + escrow = 0 | (no button) |
| Not the owner | (no button) |

Click flow:
1. Trigger fresh-JWT prompt via getDesoIdentity().jwt()
2. POST /api/creators/[slug]/claim with `{ desoJwt }`
3. On success: persistent banner like P3-4.7's pattern, showing
   what was claimed. If profileClaimed=true, also show "Profile is yours".
4. On failure: friendly error keyed off `reason`

---

## Test strategy

### Unit tests for P3-5.5

Mock the dependency chain. Cover every gate:
- 401 missing cookie / invalid JWT
- 429 rate limit
- 404 slug not found
- 400 profile-not-verified
- 400 invalid-state
- 403 not-claimer (mismatch path)
- 409 claim-in-progress (active row exists)
- 503 price-fetch-failed
- 400 amount-too-small
- 503 insolvent (with audit row creation skipped)
- 500 transfer failed → audit row marked failed
- 200 PATH A: profile-only claim (no money path)
- 200 PATH B (first-time): profile + DESO send → all updated
- 200 PATH B (repeat): DESO send only → escrow zeroed
- 500 ledger-update-failed → tx hash logged

### E2E validation post-merge

Three scenarios to cover:
1. **First-time claim with money:** insert test creator
   (tier='unclaimed', verification_status='approved', escrow=0.01,
   claim_attempted_by=null), claim it as your wallet, verify
   profile transitioned + DESO arrived + audit row created.
2. **Repeat earnings withdrawal:** insert test creator
   (tier='verified_creator', claim_status='claimed',
   deso_public_key=YOUR_WALLET, escrow=0.001), claim it, verify
   DESO arrived + escrow zeroed + audit row created. NO profile
   transition (it's already claimed).
3. **Profile-only claim (no escrow):** insert test creator
   (tier='unclaimed', verification_status='approved', escrow=0),
   claim it, verify profile transitioned + no audit row created.

---

## Sub-commit sequence (now 9)

| Commit | Status | Content |
|--------|--------|---------|
| P3-5.1  | done   | design doc v1 (earnings-only) |
| P3-5.2  | done   | DB migration (table + indexes + RPC v1) |
| P3-5.3  | done   | transferDeso primitive |
| P3-5.4  | done   | delete legacy stub |
| P3-5.1b | now    | this revision (combined flow) |
| P3-5.4b | next   | RPC v2 (extends with profile-claim args) |
| P3-5.5  | next   | implement canonical [slug]/claim body |
| P3-5.6  | next   | frontend wiring |
| P3-5.7  | next   | audit changelog |

---

## Out of P3-5 scope

- CLAIM-5 (lying-aggregate column drop)
- CLAIM-6 (tweet/URL verification brittleness)
- Reconciliation tooling for stuck in_flight rows (Phase 4)
- Email/push notifications
- Bulk claim across creators

---

## Dependencies

- `lib/deso/transferDeso.ts` (P3-5.3) — DESO native transfer
- `lib/deso/solvency.ts::checkDesoSolvency` (P2-6) — preflight
- `lib/auth/index.ts::getAuthenticatedUser` (P2-1)
- `lib/auth/deso-jwt.ts::verifyFreshDesoJwt` (P2-5)
- `lib/rate-limit/index.ts` (P2-3)
- `lib/deso/rate.ts::fetchDesoUsdRate` (existing, never-throws)
- `lib/supabase/server.ts::createServiceClient`
- Postgres RPC: mark_creator_claim_complete (extended in P3-5.4b)
- Existing creators table

No new npm deps.

---

## Open questions

### OQ-1: Should profile-only claim require fresh-JWT?

Yes. The only thing protecting a profile claim from hijack is
fresh-JWT proof of wallet control. Even with no money at stake,
profile claim is a high-value identity operation. Keep fresh-JWT.

### OQ-2: What if creator's deso_public_key is already set but
claim_status='unclaimed'?

Edge case: the verify-claim flow may have set
`deso_public_key` as part of verification. If so, the unclaimed
creator's pubkey was reserved for a specific wallet.

Decision: enforce that `creator.deso_public_key`, if set, must
match `authedPubKey`. If null, accept any wallet that fresh-JWT
authed (verify-claim's process should have constrained who can
authenticate). Add gate 5 check.

### OQ-3: amount-too-small threshold

10,000 nanos (~$0.00005 at $5/DESO). Below DeSo's typical 168-nano
network fee, but above zero. Lets users claim small amounts when
they want. Re-evaluate if dust becomes an issue.

### OQ-4: What about claim_status='claim_failed' or other unusual states?

Out of scope. Initial implementation handles `'unclaimed'` and
`'claimed'` only. Future states need their own handling.

### OQ-5: Does the existing route's verification_status check belong here?

Yes. Without verification, anyone could claim any unclaimed
profile. The verify-claim flow earned the `verification_status='approved'`
and that's the gating signal that this profile is now claimable.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | v1 design doc (earnings-only). |
| 2026-04-26 | Robert + Claude | v2 design doc (combined flow). Pre-implementation prep revealed (a) existing route is shadow-profile-claim with CLAIM-1 inline, (b) viral hook implies one-click. RPC v2 extension added as P3-5.4b. |
