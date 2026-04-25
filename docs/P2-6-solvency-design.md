# P2-6 Design — `lib/deso/solvency.ts`

**Status:** Approved, ready to implement.
**Branch:** `feat/p2-6-solvency`
**Base commit:** 0643b2a (P2-5 merge on main)
**Closes:** No specific audit finding directly. Infrastructure for
Phase 3 Paths 4 + 5 (holder rewards claim and creator claim) which
will close PATH4-* / PATH5-* findings when wired.

---

## Problem

Two transfer paths spend platform-wallet funds:
- `lib/deso/buyback.ts` — spends DESO to buy creator coins
- `lib/deso/transfer.ts` — sends creator coins (P2-4)

**Today:** Neither path checks balance before submitting. If the
wallet lacks funds:
- DeSo's construction endpoint returns non-2xx
- The error surfaces as `submit-failed` / raw error string
- Ledger row gets marked `failed`

This works (no money loss, no silent corruption), but:
- Wastes a network roundtrip per insolvent attempt
- Error messages from DeSo aren't typed — just raw strings
- Future Phase 3 routes (holder rewards claim) need a clean
  "insufficient funds, retry later" failure mode for UI

**P2-6** adds typed preflight checks. Callers can:
1. Call `checkXSolvency(...)` before `transferCreatorCoin` /
   `buybackBuy`
2. If insufficient, surface a clean error to the user (or queue
   for retry) without burning a DeSo API call to find out

---

## Solution

A single new file `lib/deso/solvency.ts` exporting two pure
decision functions composed over existing balance fetchers in
`lib/deso/api.ts`.

```ts
export type SolvencyOk = {
  ok: true;
  available: bigint;
};

export type SolvencyFailReason =
  | "insufficient"   // balance < required
  | "fetch-failed";  // DeSo API errored or returned malformed data

export type SolvencyFail = {
  ok: false;
  reason: SolvencyFailReason;
  required: bigint;
  available?: bigint;
  detail?: string;
};

export type SolvencyResult = SolvencyOk | SolvencyFail;

export async function checkDesoSolvency(
  publicKey: string,
  requiredNanos: bigint
): Promise<SolvencyResult>;

export async function checkCreatorCoinSolvency(
  holderPublicKey: string,
  creatorPublicKey: string,
  requiredNanos: bigint
): Promise<SolvencyResult>;
```

Both functions:
- Call existing fetchers in `lib/deso/api.ts`:
  - `getUserDesoBalance(publicKey)` for DESO
  - `getUserCreatorCoinBalance(holderPubkey, creatorPubkey)` for creator coins
- Compare result to `requiredNanos`
- Return tagged result, never throw
- Fail-closed on fetch error (`reason: "fetch-failed"`)

**Does NOT touch the database.** Callers own ledger lifecycle.

---

## Why bigint

P2-4's `transferCreatorCoin` already uses `bigint` for
`creatorCoinNanos` to avoid silent overflow on cheap creator coins
where `requiredNanos` can exceed `Number.MAX_SAFE_INTEGER`. P2-6's
solvency check works in the same units, so it inherits `bigint`.

Internally:
- DeSo API returns `BalanceNanos: number`. We narrow to bigint via
  `BigInt(BalanceNanos)`.
- Comparison `BigInt(available) >= requiredNanos` is safe at any
  magnitude.
- For wallets where balance EXCEEDS Number.MAX_SAFE_INTEGER,
  `BalanceNanos` would be lossy (DeSo's API uses a `string` form
  in `BalanceNanosUint256` for that case).

**Known limitation for P2-6:** We use the `number` form. Wallets
with > 9 quadrillion nanos hit overflow risk. In practice no real
wallet does. Future enhancement (out of P2-6 scope): use
`BalanceNanosUint256` string field where present.

---

## What this primitive does NOT do

- Does NOT lock or reserve balance (no atomic read-then-spend)
- Does NOT update DB
- Does NOT retry on fetch failure
- Does NOT cache balance results

**TOCTOU window:** Between solvency check and actual transfer
submission, balance can change (concurrent spend, incoming receive).
This is acceptable because:
1. The window is narrow (~100ms typically)
2. The submit will fail-closed if balance changed adversely
3. Locking is genuinely hard with on-chain state and not necessary
   given fail-closed semantics

---

## Where this gets called (NOT in P2-6 scope)

Future consumers:
- **Phase 3 Path 4** (holder rewards claim): call
  `checkCreatorCoinSolvency` before `transferCreatorCoin`
- **Phase 3 Path 5** (creator claim): call `checkDesoSolvency`
  before sending DESO to creator
- **Optional buyback.ts retrofit**: replace "fail noisily after
  wasted DeSo call" pattern with preflight (low priority — current
  behavior already fails safely)

For P2-6: ship the helpers, write tests, sit in lib unused. Same
pattern as P2-4.

---

## Test strategy (P2-6.2)

### Unit tests (~10)

Mock `getUserDesoBalance` / `getUserCreatorCoinBalance` from
`lib/deso/api.ts`. Cover:

1. DESO solvent: balance >= required → ok: true, available returned
2. DESO insolvent: balance < required → ok: false, reason="insufficient"
3. DESO exact: balance == required → ok: true (boundary)
4. DESO fetch throws → ok: false, reason="fetch-failed"
5. DESO fetch returns null/undefined → ok: false, reason="fetch-failed"
6. Creator coin solvent → ok: true
7. Creator coin insolvent → ok: false
8. Creator coin holder has no entry for that creator (zero balance)
   → ok: false (insufficient)
9. Creator coin fetch throws → ok: false, reason="fetch-failed"
10. requiredNanos == 0 → ok: true (trivial — no funds needed)

### No integration tests with live DeSo

Same rationale as P2-4: the primitive doesn't commit any side
effect. Real-network validation happens when a Phase 3 path
consumes it.

---

## Sub-commit sequence

| Commit | Content |
|--------|---------|
| P2-6.1 | This design doc (you are here) |
| P2-6.2 | `lib/deso/solvency.ts` + unit tests |
| P2-6.3 | AUDIT_MONEY_FLOWS.md changelog note |

3 commits. Smallest Phase 2 primitive.

---

## Dependencies

No new deps. Uses:
- Existing `lib/deso/api.ts` exports (`getUserDesoBalance`,
  `getUserCreatorCoinBalance`)
- Standard JS bigint

---

## Open questions

### OQ-1: Should solvency check include a buffer for tx fees?

DeSo transactions cost a small fee (typically <0.01 DESO). If a
caller checks "do I have 1.0 DESO to send" and the wallet has
exactly 1.0 DESO, the actual send will fail because there's no
fee budget.

**Decision for P2-6:** Caller's responsibility. The primitive checks
exactly what the caller asks. If they want to send 1.0 DESO and
need a 0.001 DESO fee buffer, they pass `requiredNanos =
1_001_000_000n`.

Why: keeps the primitive single-responsibility. Tx fees are caller-
domain knowledge; not all transfers have the same fee profile.

### OQ-2: Should we cache balance results?

No. Stale cache hits would defeat the point (we want CURRENT
solvency). If callers need to check multiple amounts in sequence,
they call multiple times. DeSo API is fast enough (~100-300ms).

### OQ-3: Should this support Solana / DUSD balance checks?

No. Caldera spends DESO on-chain via the platform wallet. DUSD/SOL
flows happen via HeroSwap (user-funded, not platform-wallet
solvency). Out of scope.

### OQ-4: What if `getUserDesoBalance` returns `IncludeBalance: false` results (BalanceNanos: 0)?

Existing fetcher in `lib/deso/api.ts` should pass `IncludeBalance:
true`. If not, P2-6.2 either fixes that fetcher or notes the
dependency. Verify in implementation.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc created. Research found three existing balance fetchers in lib/deso/api.ts (getUserDesoBalance, getCreatorCoinHoldings, getUserCreatorCoinBalance) — primitive becomes thin decision wrappers. |
