# P2-4 Design — `lib/deso/transfer.ts`

**Status:** Approved, ready to implement.
**Branch:** `feat/p2-4-transfer`
**Base commit:** d5590ab (P2-2 merge on main)
**Unblocks:** Phase 3 Path 4 (holder rewards claim). Also useful for future
admin-initiated payouts.

---

## Problem

The tokenomics-v2 flow (live in prod since 2026-04-23) correctly accrues
0.5% of every buy into `holder_rewards` rows, tagged by relevant creator
token. As of 2026-04-25 there are 350 pending rows, $0.02 total, 88
distinct holders.

**There is no code that pays out.** When a holder eventually clicks
"Claim my rewards," a payout route will need to send creator coins from
the platform wallet to that holder's wallet on-chain. No primitive for
that exists today.

This primitive — `transferCreatorCoin` — builds that capability. It
does not wire into any existing route in main; Phase 3 Path 4 will
consume it.

---

## Locked decisions (from memory, 2026-04-23)

- **Pay in creator coins, not DESO.** Closes the tokenomics loop: the
  0.5% auto-buy accumulates creator coins in the platform wallet; the
  0.5% holder accrual pays out from that same pool.
- **Pull-based.** Holder clicks a button in their UI; the claim route
  calls this primitive. No auto-push, no scheduled jobs.
- **Per-user atomicity.** Each claim is independent. One holder's failure
  does not block another's.

---

## The primitive

```ts
export type TransferOk = {
  ok: true;
  txHashHex: string;
  spentNanos: number;     // transaction fee in DESO nanos
};

export type TransferFailReason =
  | "invalid-public-key"       // sender/recipient/creator fails base58check shape
  | "invalid-amount"           // creatorCoinNanos <= 0 or not integer-safe
  | "construct-failed"         // DeSo api/v0/transfer-creator-coin errored
  | "sign-failed"              // local signing error (bad seed, bad hex)
  | "submit-failed"            // DeSo rejected the signed tx (e.g., insufficient balance)
  | "deso-api-unreachable";    // network/timeout

export type TransferFail = {
  ok: false;
  reason: TransferFailReason;
  detail?: string;
};

export type TransferResult = TransferOk | TransferFail;

export async function transferCreatorCoin(params: {
  creatorPublicKey: string;      // which creator's coin is being sent
  recipientPublicKey: string;    // who receives the coins
  creatorCoinNanos: bigint;      // how many nanos to send
  platformPublicKey: string;     // sender (always platform wallet here, but generic)
  platformSeed: string;          // hex seed for signing
}): Promise<TransferResult>;
```

### Why `bigint` for nanos

Creator coin nanos can exceed `Number.MAX_SAFE_INTEGER` in edge cases
(e.g., very cheap coins where a $100 payout represents >9e15 nanos).
Using `bigint` on the boundary prevents silent overflow. The DeSo API
accepts numbers — we narrow via `Number(bigint)` only after asserting
it's safe.

Rationale for NOT hiding pricing/ledger inside the primitive: P2-4
exports a pure transfer primitive. The caller (Phase 3 Path 4) owns
USD→nanos conversion, ledger writes, row aggregation. Composable.
Testable. Single responsibility.

---

## Implementation pipeline

```
Input validation (public keys, amount)
  ↓ invalid → { ok: false, reason: "invalid-public-key" | "invalid-amount" }

Construct unsigned tx:
  POST https://node.deso.org/api/v0/transfer-creator-coin
  { SenderPublicKeyBase58Check,
    CreatorPublicKeyBase58Check,
    ReceiverUsernameOrPublicKeyBase58Check,
    CreatorCoinToTransferNanos,
    MinFeeRateNanosPerKB: 1000,
    TransactionFees: null }
  ↓ fetch error → { ok: false, reason: "deso-api-unreachable" }
  ↓ non-2xx   → { ok: false, reason: "construct-failed", detail }

Sign:
  signTransaction(response.TransactionHex, platformSeed)
  ↓ throw → { ok: false, reason: "sign-failed", detail }

Submit:
  submitTransaction(signedHex)
  ↓ throw  → { ok: false, reason: "submit-failed", detail }
  ↓ returns TxnHashHex

Return:
  { ok: true, txHashHex, spentNanos: response.FeeNanos }
```

Reuses existing helpers from `lib/deso/transaction.ts`:
- `signTransaction(txHex, seed)`
- `submitTransaction(signedHex)`
- (Optionally `signAndSubmit(txHex, seed)` — wraps both and returns
  a tagged result. Likely preferable since it already handles
  sign/submit error typing internally.)

### Fail-closed semantics

No partial success. Either:
- Transfer is on-chain and we have a tx hash, OR
- We return a typed failure and the caller keeps the ledger row
  in `pending` state. Ledger integrity is preserved even when DeSo
  is unreachable.

Critical: primitive does NOT write to the database. All ledger
transitions are the caller's responsibility. This is intentional:
- Composability (works for any caller, not just holder rewards)
- Testability (no DB mocking in unit tests)
- Matches Liability-Ledger pattern: only the row-owning code path
  mutates the row.

---

## Schema changes (P2-4.3 migration)

Add one column to `holder_rewards`:

```sql
ALTER TABLE holder_rewards
  ADD COLUMN amount_creator_coin_nanos bigint;
```

- Nullable (existing 350 rows stay null — no backfill needed)
- New rows populated at accrual time from future Step 3c-era code
  extension (not scoped in P2-4 either; Phase 3 Path 4 will write
  it at claim time from current prices)
- Complements existing `amount_usd` (canonical, always populated) and
  legacy `amount_deso_nanos` (snapshot, not used post tokenomics-v2
  since payouts moved to creator coins)

No index needed — this column is not queried by itself.

### Backward compatibility

- `amount_deso_nanos` column kept (legacy, nullable already). Future
  code does not populate it. Reconciliation tooling can still read it
  for historical context.
- `claimed_amount_deso_nanos` / `claimed_tx_hash` columns kept. When
  claims start firing, `claimed_amount_deso_nanos` will actually hold
  creator-coin-nanos (misnamed but structurally correct). Phase 3 Path
  4 may add `claimed_amount_creator_coin_nanos` and deprecate the DESO-
  named column. Out of P2-4 scope.

---

## Test strategy (P2-4.2)

### Unit tests (~12)

Mock `global.fetch` and the sign/submit helpers. Cover each branch:

1. Happy path — valid params → `{ ok: true, txHashHex, spentNanos }`
2. Invalid creator public key (not base58check) → `invalid-public-key`
3. Invalid recipient public key → `invalid-public-key`
4. Invalid platform public key → `invalid-public-key`
5. `creatorCoinNanos` ≤ 0 → `invalid-amount`
6. `creatorCoinNanos` exceeds safe integer → `invalid-amount`
7. DeSo API returns non-2xx → `construct-failed`
8. DeSo API returns missing TransactionHex → `construct-failed`
9. Fetch rejects (timeout) → `deso-api-unreachable`
10. `signTransaction` throws → `sign-failed`
11. `submitTransaction` throws → `submit-failed`
12. Response.FeeNanos missing → still `ok: true` with spentNanos=0
    (fee is informational, not required)

### Fixture

Use a synthetic-but-shaped response for happy path — mimics what the
DeSo API actually returns. Cannot use a real on-chain fixture because
we'd need to actually spend the platform wallet's coins (the response
only exists when a tx is real).

### No integration test with live DeSo

This primitive commits no on-chain effect until called. Real-network
validation happens when Phase 3 Path 4 is built and we do a $0.01
holder rewards claim on preview.

---

## Sub-commit sequence

| Commit | Content |
|--------|---------|
| P2-4.1 | This design doc (you are here) |
| P2-4.2 | `lib/deso/transfer.ts` + unit tests |
| P2-4.3 | DB migration: `amount_creator_coin_nanos` column |
| P2-4.4 | AUDIT_MONEY_FLOWS.md changelog entry |

Only 4 commits. No route wiring in P2-4 — primitive sits unused until
Phase 3 Path 4 consumes it.

---

## Dependencies

No new deps. Uses existing:
- `lib/deso/transaction.ts` (signAndSubmit, signTransaction, submitTransaction)
- Node `fetch` (built-in)
- Standard types from `deso-protocol/backend-types`

---

## Open questions

### OQ-1: Minimum fee rate

DeSo's `MinFeeRateNanosPerKB` defaults in most examples to `1000` nanos/KB.
Caldera's buyback hardcodes `1000` too. We match. If DeSo raises the floor,
we update the constant in one place.

### OQ-2: Why not reuse `buildBuybackTxHex` structure?

`lib/deso/buyback.ts` has a `buildBuybackTxHex()` helper that POSTs to
`buy-or-sell-creator-coin`. We could pattern-match and build a sibling
`buildTransferTxHex()` in the same file. Decision: **keep transfer in a
new file (`lib/deso/transfer.ts`)**. Reasons:
- Different operation type, different endpoint
- Different inputs (amount-in-creator-coin-nanos vs amount-in-deso-nanos)
- Single-responsibility per file is easier to audit

### OQ-3: What about TransferDAOCoin?

DeSo also has DAO coins (different from creator coins). Caldera doesn't
use them. Out of P2-4 scope.

### OQ-4: Retry logic?

P2-2's verifyTx doesn't retry (fail-closed). P2-4's transfer also
doesn't retry. Rationale: retries belong at the caller layer where the
ledger row lifecycle is tracked. A naïve retry in the primitive could
double-send if the first attempt actually succeeded but the response was
lost.

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-26 | Robert + Claude | Design doc created. Research confirmed SDK wrapper unusable server-side; hand-roll against api/v0/transfer-creator-coin, same pattern as lib/deso/buyback.ts. |
