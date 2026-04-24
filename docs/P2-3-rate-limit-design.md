# P2-3 Design — `lib/rate-limit/`

**Status:** Approved, ready to implement.
**Branch:** `feat/p2-3-rate-limit`
**Base commit:** 4b38347 (P2-4 merge on main)
**Addresses:** No specific audit finding. Hardens existing routes against
DoS / abuse. Pre-launch posture: prevent cost-amplification attacks
before users arrive.

---

## Problem

Current state (confirmed 2026-04-26):

- **Zero proper rate limiting** on money routes (`/api/trades`,
  `/api/trades/sell`) or login (`/api/auth/deso-login`).
- **Two broken in-process limiters**: `app/api/markets/[id]/news` and
  `app/api/admin/autonomous-cycle` use module-level `Map<string, number>`.
  These reset on cold start and don't share state across serverless
  instances. Per hygiene memory #17: news route also 429s during normal
  browsing (window too tight, limiter leaks state).
- **One working DB-based limiter**: `app/api/markets/create-fan` uses
  Supabase row-count; persistent across instances. Keep as-is.

Attack surface without rate limits:

1. **Cost-amplification DoS.** Each `/api/trades` call does on-chain tx
   verification via DeSo's `api/v1/transaction-info`. An attacker with
   a valid session cookie could spam 1000 req/sec. We pay compute, DeSo
   might blacklist our IP.
2. **Login DoS.** Each `/api/auth/deso-login` POST does a DeSo JWT
   verification + `get-single-derived-key` cross-check. Spam could
   similarly exhaust our DeSo API budget.
3. **Social spam.** Comments/follows/watchlist routes (out of P2-3
   scope — deferred).

---

## Solution

Add `lib/rate-limit/` primitive using `@upstash/ratelimit` and
`@upstash/redis`. Apply to the three P0 routes. Fix the broken news
route limiter as a hygiene win.

### Why Upstash

- Vercel-native recommendation for Next.js 14 rate limiting
- Edge-runtime compatible (HTTP-based, not TCP)
- Free tier: 10k commands/day, 256MB storage
- Industry standard pattern — minimal cognitive surface
- Sliding-window algorithm built-in (much better UX than fixed-window)

Alternative considered and rejected:
- **Vercel KV** — wraps Upstash, slightly more opinionated, less control
  over limiter algorithm. No real advantage over Upstash directly.
- **In-process Map** — broken on serverless (current state).
- **DB-based** — works but adds DB round-trip to every request; overkill
  for the throughput we're protecting against.
- **Rolling our own** — silly. Battle-tested library exists.

---

## Scope (locked)

P2-3 ships rate limits on these routes ONLY:

| Route | Dimension | Limit | Rationale |
|-------|-----------|-------|-----------|
| `/api/trades` (POST) | session pubkey | **10 / minute** | User-initiated trades; typical buy is ~30s+ between clicks |
| `/api/trades/sell` (POST) | session pubkey | **10 / minute** | Same |
| `/api/auth/deso-login` (POST) | IP | **5 / minute** | Login shouldn't fire more than once every 10-20s; 5/min gives retry headroom |
| `/api/markets/[id]/news` (GET) | IP | **30 / minute** | Normal browsing needs headroom; replaces broken 1/60s limiter |

Routes explicitly OUT of P2-3 scope (deferred to later hygiene pass or
Phase 3):
- All claim routes (pre-launch; protect before launch)
- Social routes (comments, follows, watchlist) — social spam problem,
  not a cost/DoS problem
- Admin routes (password-gated already)
- `markets/create-fan` (existing DB-based limiter works)
- `admin/autonomous-cycle` (password-gated; low priority)

---

## The primitive

```ts
// lib/rate-limit/index.ts

export type RateLimitCheckResult = {
  allowed: boolean;
  remaining: number;     // requests remaining in current window
  resetAt: number;       // epoch ms when window resets
};

export async function checkRateLimit(
  bucketKey: string,      // composite: "trades:BC1Y..." or "login-ip:1.2.3.4"
  config: "trades" | "login" | "news",
): Promise<RateLimitCheckResult>;
```

### Why bucketKey as a free-form string

Routes have different identity dimensions. The caller composes the key
(e.g. route name + pubkey for per-user, route name + IP for per-IP).
This keeps the primitive simple — one lookup per bucketKey.

### Config instead of raw limit/window params

Named configs (`trades`, `login`, `news`) instead of `(limit, windowMs)`
so:
- Rate budgets are defined in one place (easier to tune)
- Consistency across routes that share semantic class
- Future config additions don't need route-handler changes

### Return shape, not throw

Same fail-closed discipline as P2-2 / P2-4 — tagged return, never throws.
If Upstash is unreachable:
- **Fail OPEN** (allow request) — rate limiting is DoS defense, not a
  security boundary. Treating Upstash downtime as a hard 503 would be
  worse UX than a brief window of unrestricted traffic.
- Log the failure. Future alerting can watch for elevated fail-open
  rate.

This is the inverse of verifyTx's fail-closed — and the reason is
that verifyTx protects money correctness (critical), rate limit
protects cost (recoverable). Different tradeoff.

---

## Route integration pattern

Each protected route adds 5-8 lines:

```ts
// /api/trades/route.ts
import { checkRateLimit } from "@/lib/rate-limit";
// ... existing imports ...

export async function POST(req: NextRequest) {
  // Existing auth check (P2-1)
  const authed = getAuthenticatedUser(req);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NEW P2-3: rate limit BEFORE any DeSo API calls
  const rl = await checkRateLimit(`trades:${authed.publicKey}`, "trades");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      },
    );
  }

  // ... rest of existing handler unchanged ...
}
```

Rate limit runs AFTER auth but BEFORE any expensive work (DeSo API calls,
DB queries). Worst case: attacker with valid cookie gets throttled before
burning our DeSo budget.

For login (pre-auth), the dimension is IP:

```ts
const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
  ?? req.headers.get("x-real-ip")
  ?? "unknown";
const rl = await checkRateLimit(`login-ip:${ip}`, "login");
if (!rl.allowed) { /* 429 */ }
```

---

## Config values

All in `lib/rate-limit/config.ts`:

```ts
export const RATE_LIMIT_CONFIGS = {
  trades: { limit: 10, windowSeconds: 60 },
  login:  { limit: 5,  windowSeconds: 60 },
  news:   { limit: 30, windowSeconds: 60 },
} as const;
```

Single source of truth. If a limit needs tuning, one place to change.

---

## Environment

Two new env vars required:

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Setup instructions (in P2-3.2):
1. Create free Upstash account (Redis.upstash.com)
2. Create a new Redis database (global, AOF disabled, eviction off)
3. Copy REST URL + token from dashboard
4. Add to `.env.local` (dev)
5. Add to Vercel → Environment Variables (both Production + Preview)
6. Redeploy preview to pick up env

If env vars are missing at runtime:
- `lib/rate-limit/index.ts` logs an ERROR once on module init
- Every `checkRateLimit()` call returns `{ allowed: true, ... }` (fail open)
- Site continues to function, but no rate limiting in effect

---

## Free tier monitoring

Upstash free tier: 10,000 commands/day.

Each `checkRateLimit` = ~2 commands (read + increment).

Budget at launch:
- 4 protected routes at 30 req/min peak each = 120 req/min total
- × 60 min × 16 daytime hours × 2 cmds = **~230k commands/day** ← over budget

Caveats:
- Peak rate ≠ sustained rate. Real world probably 10% of peak.
- Upstash paid tier: $0.2 per 100k commands. Even at 500k/day = $1/day.

**Plan:** launch on free tier. Monitor via Upstash dashboard. Upgrade
before we need to (i.e., at first elevated usage day).

---

## Sub-commit sequence

| Commit | Content |
|--------|---------|
| P2-3.1 | This design doc (you are here) |
| P2-3.2 | `lib/rate-limit/` + deps + unit tests. DOES NOT yet add to routes. |
| P2-3.3 | Wire `/api/trades` + `/api/trades/sell` (per-user limit) |
| P2-3.4 | Wire `/api/auth/deso-login` (per-IP limit) |
| P2-3.5 | Replace broken Map in `/api/markets/[id]/news` with proper limiter |
| P2-3.6 | AUDIT_MONEY_FLOWS.md changelog note |

6 commits. Each small and testable.

---

## Test strategy

### Unit tests (P2-3.2 — ~12 tests)

Mock `@upstash/ratelimit` + `@upstash/redis`. Cover:
- Happy path: allowed = true, remaining decreases on each call
- Limit exceeded: allowed = false after N calls in window
- Different bucketKeys are independent
- Different config names use correct limits
- Missing env vars: fail open (returns allowed = true, logs warning)
- Upstash network error: fail open
- Unknown config name: throw (programmer error)

### Integration tests (P2-3.3 / P2-3.4 / P2-3.5)

For each wired route: add a test that hammers the route N+1 times and
asserts the N+1-th response is 429 with correct headers.

### Manual validation post-merge

- Open browser → preview URL
- Hit refresh on homepage a few times — no 429s (confirms we're not
  overly aggressive on the news route)
- POST `/api/trades` 11 times rapidly → 11th returns 429 (confirms
  trades limiter works)

---

## Open questions

### OQ-1: Should rate limits apply before or after auth?

For money routes: **after auth**. This means an anonymous attacker
can't trigger rate-limit checks at all (middleware auth rejects them
with 401 first, never reaching rate-limit logic). Limits are a
per-user budget, not a DDoS perimeter.

For login: **before auth** (obviously — auth is the thing being
protected). Limit by IP pre-auth.

### OQ-2: What about the middleware-level IP rate limit for blanket DDoS?

Out of P2-3 scope. Vercel's edge layer already mitigates classic DDoS
(syn floods, bot traffic) — we don't need to solve that ourselves.
If we ever see abnormal traffic patterns, we can add a middleware
sliding window for all `/api/*` at 100 req/min/IP as a safety net.
Revisit post-launch.

### OQ-3: Should 429 responses include X-RateLimit-* headers?

Yes — allows well-behaved clients to back off gracefully. Malicious
clients ignore them; that's fine, we still throttle.

### OQ-4: Logging

On every 429, log `[ratelimit] denied bucket=${bucketKey} config=${configName}`.
On every fail-open (Upstash unreachable), log ERROR. Monitoring comes
later.

---

## Dependencies

New npm deps in P2-3.2:
- `@upstash/ratelimit` (latest, ~3KB)
- `@upstash/redis` (latest, ~8KB)

Both are pure TypeScript/JavaScript with no native deps. Edge-safe.
Free forever tier — no API key needed for the libraries themselves
(only Upstash account for runtime).

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc created. Research: zero proper rate limits exist; two broken in-process Maps; one working DB-based limiter on create-fan. Pattern: Upstash. Scope: 4 P0 routes + hygiene fix on news. |
