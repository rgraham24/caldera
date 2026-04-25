# P2-5 Design — Fresh-JWT Recency Check

**Status:** Approved, ready to implement.
**Branch:** `feat/p2-5-fresh-jwt`
**Base commit:** 5f2418c (P2-3 merge on main)
**Closes:** CLAIM-2 (currently *Mitigated*; this brings it to *Resolved*).

---

## Problem

Per the locked OQ-1 hybrid auth design (memory #16):

- P2-1 shipped HTTP-only signed session cookies for **baseline** auth
  (used on all routes that require a logged-in user).
- High-value actions (creator profile claim, winner claims >$100,
  future admin) need a stronger proof: cryptographic evidence that the
  *caller is the same wallet right now*, not just "someone with a
  cookie."

The original P2-1 design referenced this as "signed-nonce challenge."
Research (P2-5 inspection of DeSo Identity) found that DeSo's identity
provider has **no `identity.sign(arbitraryBytes)` API** — the only
client-side signing primitive available is `identity.jwt()`, which
produces a standard JWT.

This means the classic challenge-response nonce flow is impossible
without a hard fork or a workaround. Pattern C — "fresh JWT recency
check" — gives equivalent security using only what DeSo Identity
already exposes.

---

## Design

### Overview

For high-value actions:
1. Frontend calls `identity.jwt()` *immediately before* the action
2. Sends `{ ...payload, desoJwt }` to the server
3. Server runs existing `verifyDesoJwt(desoJwt)` AND a new
   `iat` recency check (within 60 seconds)
4. If both pass → execute action. If either fails → 401.

### Why this works

- JWT signature proves wallet ownership (private key is required to
  sign — already enforced by `verifyDesoJwt`).
- `iat` recency check defeats replay attacks within the JWT's natural
  30-minute expiry. An attacker capturing a JWT can use it for at most
  60 seconds (the recency window), not 30 minutes.
- No new client-side API needed. Reuses `identity.jwt()`, which is
  already called in 3 places in the codebase.
- No new infrastructure: no DB table, no Redis writes, no nonce
  storage. State-free.

### Tradeoffs vs true nonce-challenge

| | Fresh-JWT (Pattern C) | True nonce |
|---|---|---|
| Replay protection | 60s window | Single use |
| Server-side state | None | Nonce table |
| Implementation cost | Low | Medium |
| Possible on DeSo today | ✅ | ❌ (no signArbitrary) |

The 60-second replay window is a real (small) gap vs single-use nonces.
Mitigations:
- TLS protects in-transit (no plaintext capture)
- Rate limiting (P2-3) bounds replay velocity
- Network-bound: an attacker capturing JWT and replaying within 60s
  needs MITM or local attacker — both have larger attack surfaces

For P2-5's use cases (creator claim → high-value but not financially
catastrophic; winner claims protected by separate verification), 60s
is acceptable.

---

## API surface

### New helper

`lib/auth/deso-jwt.ts`:

```ts
export type FreshJwtVerifyResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: FreshJwtFailReason };

export type FreshJwtFailReason =
  | "invalid-jwt"          // signature failed (existing verifyDesoJwt)
  | "stale"                // iat older than maxAgeSeconds
  | "future-issued"        // iat in the future (clock skew or attack)
  | "missing-iat"          // payload missing iat field
  | "derived-key-invalid"; // existing — DeSo says key is not active

export async function verifyFreshDesoJwt(
  jwt: string,
  publicKey: string,
  opts?: { maxAgeSeconds?: number; clockSkewSeconds?: number }
): Promise<FreshJwtVerifyResult>;
```

Defaults:
- `maxAgeSeconds: 60`
- `clockSkewSeconds: 5` (allow JWT iat to be up to 5s in the future
  without rejecting; common across distributed systems)

### Wrapping logic

```
1. Run existing verifyDesoJwt(jwt, publicKey)
   ↓ fail → return { ok: false, reason: matched-existing-failure }

2. Decode payload, extract iat (int seconds since epoch)
   ↓ missing → { ok: false, reason: "missing-iat" }

3. Compute now = floor(Date.now() / 1000)
   - If iat > now + clockSkewSeconds → "future-issued"
   - If iat < now - maxAgeSeconds  → "stale"
   - Otherwise → { ok: true, publicKey }
```

### Why a wrapper, not modifying verifyDesoJwt

- `verifyDesoJwt` is used at login where 30-min JWT expiry is fine.
- Adding a strict mode parameter complicates the simpler call site.
- Single-responsibility per function. Easier to audit, test, deprecate.

---

## Route wiring (P2-5.3)

Target: `/api/creators/[slug]/claim/route.ts`.

**Today** (CLAIM-2 finding):
- Reads `desoPublicKey` from request body
- No wallet-ownership proof
- Trusts caller wholesale

**After P2-5.3:**
- Reads `{ desoJwt }` from request body
- Calls `verifyFreshDesoJwt(desoJwt)` — derives `desoPublicKey` from
  the verified JWT
- Body-supplied `desoPublicKey` (if present) is **ignored** (defense
  in depth)
- Same pattern as P2-1 trades route: identity comes from cryptographic
  source, never the body

If verification fails → 401 with reason in response body for client
debugging. (Reason is not security-sensitive; helps frontend retry.)

### What about session cookie?

The session cookie (P2-1) provides baseline identity on this route too
— middleware stamps `x-deso-pubkey` from the cookie. P2-5 adds a
**second layer**: even with a valid cookie, the action requires a
recent fresh JWT signature.

Why both?
- Cookie = "you're logged in" (lasts ~7 days)
- Fresh JWT = "you proved you're you in the last 60 seconds"

Cookie alone is what BUY-1/SELL-1 fixed for trades. Claim is higher
value — needs the additional proof.

If `x-deso-pubkey` from cookie ≠ public key from fresh JWT → 401.
Defense in depth.

---

## Frontend changes (P2-5.4)

The claim flow's frontend (presumably already exists or is being
built) needs to:

1. Call `identity.jwt()` to get a fresh JWT
2. Include it in the POST body to `/api/creators/[slug]/claim`

If `identity.jwt()` fails (user denied wallet popup, network error),
abort and show error. Don't fall back to body-supplied identity.

Existing `identity.jwt()` callers in the codebase:
- `app/auth/callback/page.tsx`
- `app/(auth)/login/page.tsx`
- `components/providers/DesoSDKProvider.tsx`

We follow the same pattern in the claim component.

---

## Test strategy

### Unit tests for verifyFreshDesoJwt (P2-5.2 — ~10 tests)

Mock `verifyDesoJwt`. Cover:

1. Happy path — valid JWT, recent iat → ok: true, publicKey returned
2. verifyDesoJwt fails (signature invalid) → reason flows through
3. iat exactly at boundary (now - 60s) → still ok
4. iat just past boundary (now - 61s) → "stale"
5. iat in the past beyond window → "stale"
6. iat far future (>5s skew) → "future-issued"
7. iat just slightly future (within skew) → ok
8. Missing iat field in payload → "missing-iat"
9. Custom maxAgeSeconds (e.g., 30) respected
10. Custom clockSkewSeconds respected

### Integration tests for /api/creators/[slug]/claim (P2-5.3)

- 401 on missing desoJwt
- 401 on invalid desoJwt
- 401 on stale desoJwt (iat too old)
- 401 if cookie pubkey ≠ JWT pubkey
- 200 on fresh, valid JWT matching cookie
- Body-supplied desoPublicKey is ignored (test by passing wrong key)

### Manual E2E (post-merge on preview)

- Log in normally → cookie set
- Open browser DevTools, attempt claim API call with stale JWT (capture
  one, wait 90s, replay) → expect 401 stale
- Click claim button in UI → fresh JWT issued automatically → expect 200

---

## Sub-commit sequence

| Commit | Content |
|--------|---------|
| P2-5.1 | This design doc (you are here) |
| P2-5.2 | `verifyFreshDesoJwt` helper + unit tests |
| P2-5.3 | Wire `/api/creators/[slug]/claim` |
| P2-5.4 | Frontend: claim component calls `identity.jwt()` before POST |
| P2-5.5 | AUDIT_MONEY_FLOWS.md changelog (CLAIM-2 → Resolved) |

5 commits.

---

## Dependencies

No new deps. Reuses:
- `lib/auth/deso-jwt.ts` (verifyDesoJwt)
- `@noble/secp256k1`, `@noble/hashes`, `bs58` (already installed)
- DeSo Identity SDK's `identity.jwt()` (already used in codebase)

---

## Open questions

### OQ-1: What about claim routes other than [slug]/claim?

Research found 9 claim-adjacent routes. P2-5 wires only [slug]/claim
(the actual execution). The verification routes (verify-claim,
tweet-verify, watch-claim) prove a different thing (social/identity
link), not wallet ownership. They should ALSO require fresh-JWT in
production but their attack surface is smaller (they don't move money).
**Out of P2-5 scope.** Future hygiene pass can wire them.

### OQ-2: 60 seconds — could be too tight?

DeSo Identity's signing flow takes 5-15 seconds (popup, user click,
signature). 60s gives 45-55s of slack. Should be plenty.

If real-world feedback shows it's too tight, bump to 120s. Single
constant in `lib/auth/deso-jwt.ts`.

### OQ-3: What if iat is missing?

DeSo Identity always sets iat. But defensively, we reject missing iat
(would otherwise allow infinite-replay JWTs).

### OQ-4: Custom JWT claims?

Research found `identity.jwt()` does NOT accept custom claims at the
SDK level. We can't embed a server-issued nonce. This locks Pattern C
as the only option.

### OQ-5: What if a user is logged in with cookie but DeSo derived key
is revoked between login and claim?

The fresh JWT call would fail in `identity.jwt()` (the wallet would
reject signing). User sees error in browser. Server never gets the
request. Edge case handled by client.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc created. Research locked Pattern C after finding DeSo Identity has no signArbitrary primitive. JWT iat recency check provides equivalent security in 60s window. |
