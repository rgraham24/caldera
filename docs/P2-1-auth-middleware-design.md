# P2-1 Auth Middleware — Design

**Status:** Approved 2026-04-23 — ready to implement
**Branch:** `feat/p2-1-auth-middleware`
**Resolves:** BUY-1, SELL-1, CLAIM-2 (partial — signed-nonce at P2-5)
**Last updated:** 2026-04-23

---

## Goal

Replace the current pattern of accepting `desoPublicKey` from request bodies
with cryptographically-verified session cookies. Every money-movement
route must verify the requester's wallet ownership before executing.

## Architecture: Option B — Server-signed cookie wrapping DeSo JWT

### Trust flow

```
┌─────────────────────────────────────────────────────────────┐
│                     LOGIN (one-time)                         │
├─────────────────────────────────────────────────────────────┤
│ 1. User clicks "Sign in with DeSo"                           │
│ 2. Full page redirect → DeSo Identity site                   │
│ 3. User authorizes, DeSo redirects back to /auth/callback    │
│ 4. Callback page receives derived key material               │
│ 5. Client: identity.jwt() → DeSo JWT signed with derived key │
│ 6. Client: await POST /api/auth/deso-login                   │
│            body: { publicKey, desoJwt }                      │
│ 7. Server verifies desoJwt:                                  │
│    - Decode JWT header + payload + signature                 │
│    - Extract sub (claimed publicKey) — must match body       │
│    - Extract derivedPublicKey from DeSo Identity snapshot    │
│    - Verify secp256k1 signature with @noble                  │
│    - Check exp claim, iat claim                              │
│ 8. If valid: server issues own session cookie                │
│    Cookie value = base64url(HMAC-SHA256(payload, SIGNING_KEY))│
│                 + "." + base64url(payload)                   │
│    Payload = { publicKey, iat, exp }                         │
│    7-day expiry                                              │
│    HttpOnly; Secure; SameSite=Lax; Path=/                    │
│ 9. Client proceeds — cookie automatically included in all    │
│    same-origin requests                                      │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              EVERY SUBSEQUENT REQUEST                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Browser includes caldera-session cookie automatically     │
│ 2. middleware.ts (repo root) intercepts request              │
│ 3. Extracts cookie, verifies HMAC signature                  │
│ 4. Checks exp claim                                          │
│ 5. On valid: sets request header 'x-deso-pubkey' with value  │
│ 6. On invalid/expired: strips cookie, request continues      │
│    (routes decide whether to require auth)                   │
│ 7. Route handler reads 'x-deso-pubkey' from headers          │
│ 8. If absent and route requires auth: return 401             │
└─────────────────────────────────────────────────────────────┘
```

### Why Option B, not A

- **Explicit session lifecycle**: we control expiry, not DeSo
- **Decoupled from DeSo JWT format changes**
- **Matches OQ-1 lock** (`COOKIE_SIGNING_KEY` env var specified in audit doc)
- **Per-request cost is lower**: HMAC verify is O(1), no DeSo API call needed

---

## File structure

```
middleware.ts                              (NEW — repo root)
lib/auth/
  cookie.ts                                (NEW — HMAC sign/verify)
  deso-jwt.ts                              (NEW — verify DeSo JWT)
  index.ts                                 (NEW — getAuthenticatedUser helper)
app/api/auth/
  deso-login/route.ts                      (MODIFY — verify JWT, set cookie)
  logout/route.ts                          (NEW — clear cookie)
app/api/trades/route.ts                    (MODIFY — require auth)
app/api/trades/sell/route.ts               (MODIFY — require auth)
__tests__/auth/
  cookie.test.ts                           (NEW)
  deso-jwt.test.ts                         (NEW)
  middleware.test.ts                       (NEW — integration)
docs/
  P2-1-auth-middleware-design.md           (THIS FILE — commits first)
```

**Client-side changes:**
- `app/auth/callback/page.tsx` — await the login fetch (not fire-and-forget)
- `components/providers/DesoSDKProvider.tsx` — await login, call logout endpoint
- `components/markets/TradeTicket.tsx` — remove `desoPublicKey` from POST bodies (cookie supersedes)

**No changes to:**
- Zustand store (client-side auth state still useful for UI)
- `lib/deso/auth.ts` (DeSo Identity wallet connect flow unchanged)
- `lib/deso/identity.ts` (DeSo configure() unchanged)

---

## Cookie specification

### Format

```
caldera-session = <base64url(hmac)>.<base64url(payload)>
```

### Payload (JSON)

```ts
{
  publicKey: string,   // DeSo public key (BC1YL...)
  iat: number,         // issued at (unix seconds)
  exp: number          // expires at (unix seconds, iat + 7 days)
}
```

### Flags

- `HttpOnly` — not accessible to JavaScript (XSS defense)
- `Secure` — HTTPS only
- `SameSite=Lax` — allows DeSo Identity redirect chain but blocks CSRF
- `Path=/` — available to all routes
- `Max-Age=604800` — 7 days

### Rotation

- `COOKIE_SIGNING_KEY` stored in Vercel env (new secret)
- Locally stored in `.env.local` (git-ignored)
- Minimum 32 bytes of entropy (256-bit)
- Key rotation = all sessions invalidated (acceptable for Phase 2)

---

## DeSo JWT verification

### What DeSo's JWT looks like (from SDK inspection)

From `node_modules/deso-protocol/src/identity/crypto-utils.js`:

```js
getSignedJWT(derivedSeedHex, algorithm, {
  iat?: number,
  exp?: number,
  derivedPublicKeyBase58Check?: string
})
```

DeSo signs with ES256 (ECDSA over secp256k1, SHA-256). We verify with
`@noble/secp256k1` (already in deps).

### Verification steps

1. Split JWT into `header.payload.signature`
2. Base64url-decode each part
3. Parse header: `{ alg: "ES256", typ: "JWT" }` — require exact match
4. Parse payload: expect `{ derivedPublicKeyBase58Check: string, iat: number, exp: number }`
   **Note:** DeSo's JWT has NO `sub` claim. The derived public key in the
   payload is the only cryptographic identifier in the token.
5. Check `exp` (DeSo JWTs expire 30 minutes after issuance; reject if past)
6. Check `iat` is within last 5 minutes (reject stale JWTs — replay defense)
7. Reconstruct signing input: `base64url(header) + "." + base64url(payload)`
8. SHA-256 hash the input
9. Base64url-decode the signature (64 raw bytes = r (32) + s (32), JOSE format)
10. Verify signature with `@noble/secp256k1.verify(sig, hash, derivedPublicKeyBase58Check)`
    — using the DERIVED key, not the owner key. DeSo signs JWTs with the
    per-app derived key.
11. Cross-check binding via DeSo API:
    `GET https://node.deso.org/api/v0/get-single-derived-key/{ownerPublicKey}/{derivedPublicKey}`
    Response must contain `DerivedKey.IsValid === true`.
    This step proves the derived key is authorized to act on behalf of the
    claimed owner public key. Without it, any user with any derived key could
    claim any owner public key they wanted.
12. All checks pass → the requester controls `ownerPublicKey`'s wallet.
    Issue session cookie for that owner public key.

### Attack defenses

| Attack | Defense |
|---|---|
| Replay old JWT from a captured login | `iat` check (5-minute window) + rate limit on login endpoint |
| Forge JWT | Can't — secp256k1 signatures require private key |
| Submit valid JWT signed by unauthorized derived key, claiming any owner pk | DeSo API check (step 11) rejects — `IsValid` will be false |
| Submit JWT from a revoked derived key | DeSo API `IsValid` returns false |
| DeSo API unavailable | Fail closed — reject login until API reachable |
| Capture session cookie via XSS | `HttpOnly` flag blocks JS access |
| CSRF on money routes | `SameSite=Lax` blocks cross-origin POSTs |

---

## Middleware behavior

### `middleware.ts` (Next.js edge middleware)

```
FOR EVERY REQUEST (matcher: /api/:path*):
  cookie = request.cookies.get('caldera-session')
  IF no cookie: continue without auth header
  IF cookie exists:
    valid = verifyCookie(cookie.value)
    IF !valid: clear cookie, continue
    IF expired: clear cookie, continue
    IF valid:
      request.headers.set('x-deso-pubkey', valid.publicKey)
  continue to route handler
```

### Route-level enforcement

Middleware only *extracts* identity — it doesn't *require* it. Each route
decides whether auth is mandatory. This keeps public routes (e.g.,
market listings) unauthenticated by default.

Pattern in protected routes:

```ts
const pubKey = request.headers.get('x-deso-pubkey');
if (!pubKey) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
// proceed — pubKey is cryptographically verified
```

A helper `getAuthenticatedUser(request)` in `lib/auth/index.ts` abstracts this.

---

## Test plan

### Unit tests (Vitest, following tokenomics-v2 patterns)

**`__tests__/auth/cookie.test.ts`**
- signCookie/verifyCookie round-trip
- tampered payload fails verification
- tampered signature fails verification
- expired payload fails verification
- malformed cookie strings (no dot, bad base64, non-JSON payload) fail cleanly
- wrong signing key fails verification

**`__tests__/auth/deso-jwt.test.ts`** (unit tests, DeSo API mocked)
- Valid DeSo JWT with mocked `IsValid: true` → verifies, returns owner pk
- Tampered payload → signature fails
- Tampered signature → signature fails
- JWT missing `derivedPublicKeyBase58Check` claim → rejects
- JWT header `alg` other than ES256 → rejects
- JWT header `typ` other than JWT → rejects
- Expired JWT (`exp` in past) → rejects
- `iat` in future → rejects (clock skew protection)
- `iat` > 5min old → rejects (replay defense)
- DeSo API returns `IsValid: false` → rejects
- DeSo API returns 4xx/5xx → rejects (fail closed)
- DeSo API network error → rejects (fail closed)
- ES256/secp256k1 signature math correctness using `@noble/secp256k1` v3 API
- Base64url decode of signature: wrong length (not 64 bytes) → rejects

**`__tests__/auth/middleware.test.ts`** (integration via Next.js test utilities)
- no cookie → no auth header attached
- valid cookie → `x-deso-pubkey` header set
- expired cookie → cookie cleared, no header
- tampered cookie → cookie cleared, no header

### Integration test on preview

1. Manual login flow end-to-end (preview URL, real DeSo Identity)
2. Verify `caldera-session` cookie set on `/auth/callback` response
3. Verify cookie is HttpOnly, Secure, SameSite=Lax in browser devtools
4. Open new tab, trade — verify middleware attaches `x-deso-pubkey`
5. Clear cookie manually — verify trade returns 401
6. Wait 7+ days (or hack `exp` in a debug endpoint) — verify expiry works
7. Logout — verify cookie cleared, subsequent trade returns 401

---

## Migration path for existing deployments

**No production migration needed.** Zero users today. On merge to main:
- All existing clients (none) will 401 until they re-login
- Re-login is transparent via DeSo Identity (same click)
- No data migration, no DB changes for P2-1 (cookie is stateless)

`deso_sessions` DB table (proposed in a previous false-start draft) is **NOT**
needed for P2-1. The cookie is self-contained. This may change for P2-5
(per-action nonce challenges may use a DB-backed short-TTL table).

---

## Sub-commit plan

Each sub-commit is small, tested, pushed, reviewable.

### P2-1.1 — Cookie primitives + env var

**Files:**
- `lib/auth/cookie.ts` — `signCookie(payload, key)`, `verifyCookie(cookie, key)`
- `__tests__/auth/cookie.test.ts`
- `.env.example` — add `COOKIE_SIGNING_KEY` placeholder

**Outside commit:** `.env.local` updated; Vercel env var set via dashboard.

**Done when:** Unit tests pass. No routes touched yet.

### P2-1.2 — DeSo JWT verification

**Files:**
- `lib/auth/deso-jwt.ts` — `verifyDesoJwt(jwt, expectedPublicKey)`
- `__tests__/auth/deso-jwt.test.ts`

**Done when:** Unit tests pass. Including a fixture test with a real DeSo
JWT captured from preview.

### P2-1.3 — Login endpoint rewrite

**Files:**
- `app/api/auth/deso-login/route.ts` — now requires `{publicKey, desoJwt}`,
  verifies JWT, issues session cookie
- `app/api/auth/logout/route.ts` — NEW, clears cookie
- `__tests__/auth/login.test.ts` — integration

**Done when:** Login endpoint rejects unsigned publicKeys, accepts valid
JWTs, sets cookie with correct flags.

### P2-1.4 — Middleware + getAuthenticatedUser helper

**Files:**
- `middleware.ts` at repo root
- `lib/auth/index.ts` — `getAuthenticatedUser(request)`
- `__tests__/auth/middleware.test.ts`

**Done when:** Middleware extracts cookie, sets header, integration tests pass.

### P2-1.5 — Wire trade routes through middleware

**Files:**
- `app/api/trades/route.ts` — use `getAuthenticatedUser`, remove body trust
- `app/api/trades/sell/route.ts` — same

**Done when:** Both routes 401 without cookie, 200 with valid cookie.
Manual preview test: trade with cookie → works. Trade without cookie → 401.

### P2-1.6 — Client integration

**Files:**
- `app/auth/callback/page.tsx` — await login fetch (no longer fire-and-forget)
- `components/providers/DesoSDKProvider.tsx` — await login, call logout on disconnect
- `components/markets/TradeTicket.tsx` — stop sending `desoPublicKey` in body
- Any other route that sent `desoPublicKey` unnecessarily

**Done when:** End-to-end login → trade → logout cycle works on preview.

### P2-1.7 — Update AUDIT_MONEY_FLOWS.md changelog

**Files:**
- `AUDIT_MONEY_FLOWS.md` — Changelog section updated:
  - BUY-1: Resolved, commit `<P2-1.5 hash>`
  - SELL-1: Resolved, commit `<P2-1.5 hash>`
  - CLAIM-2: Mitigated — cookie layer done; signed-nonce deferred to P2-5

**Done when:** PR commit lands, ready for merge to main.

---

## Decisions locked

- **Architecture:** Option B (server-signed cookie wrapping verified DeSo JWT)
- **Cookie signing library:** Node `crypto.createHmac` (HMAC-SHA256, no new deps)
- **JWT verification library:** `@noble/secp256k1` (already in deps)
- **Cookie flags:** `HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`
- **Session lifetime:** 7 days
- **Route enforcement:** per-route (middleware extracts, route requires)
- **Session store:** stateless (no DB table)
- **Signed-nonce (per-action):** deferred to P2-5, not P2-1

## Decisions still open (to be resolved during implementation)

- ~~Exact DeSo JWT claim field name for public key~~ **RESOLVED by research**:
  DeSo JWTs have no `sub` claim. The `derivedPublicKeyBase58Check` payload
  field is the only key identifier. Binding to owner key is verified via
  DeSo's `get-single-derived-key` API endpoint (not via the JWT payload).
- Whether to cache `IsValid: true` results short-term to reduce DeSo API
  load during bursty logins — DEFER to P2-1.3. Likely no cache for MVP.
- Whether to include a `jti` (JWT ID) in our session payload for future
  revocation support — likely YES for forward-compat
- How to surface "session expired" errors to the client UX — likely 401 +
  redirect to login, handled in a later cleanup pass
