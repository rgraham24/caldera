# P2-2 Design — `lib/deso/verifyTx.ts`

**Status:** Approved, ready to implement.
**Branch:** `feat/p2-2-verify-tx`
**Base commit:** b05f72d (P2-1 merge on main)
**Resolves:** BUY-2 (unverified txnHash → free positions), BUY-3 (no replay protection)

---

## Problem

`/api/trades` currently accepts any `txnHash` string from the client
and writes it to `trades.tx_hash` without:

1. Verifying the hash refers to a real DeSo transaction.
2. Verifying the tx was sent by the authenticated user.
3. Verifying the recipient is the Caldera platform wallet.
4. Verifying the amount equals (or exceeds) the claimed trade amount.
5. Preventing the same hash from being reused across multiple trades.

### BUY-2 (free positions)
Attacker with valid session cookie (P2-1 gate) can still POST
`{ txnHash: "any_real_tx_on_chain", amount: 1000 }` and receive a
$1,000 position without ever sending DESO.

### BUY-3 (replay)
Attacker sends one legitimate $1 tx, captures the hash, submits
`/api/trades` N times with the same hash → gets N positions for $1.

---

## Solution

Add `lib/deso/verifyTx.ts` implementing `verifyDesoTransfer`:

```ts
type VerifyOk = {
  ok: true;
  actualAmountNanos: number;
  blockHashHex: string | null; // null if still in mempool
};

type VerifyFail = {
  ok: false;
  reason:
    | "tx-not-found"
    | "tx-not-basic-transfer"
    | "sender-mismatch"
    | "recipient-not-found"
    | "amount-too-low"
    | "deso-api-unreachable"
    | "invalid-hex"
    | "invalid-encoding";
};

type VerifyResult = VerifyOk | VerifyFail;

async function verifyDesoTransfer(
  txHashHex: string,
  expectedSenderBase58: string,
  expectedRecipientBase58: string,
  expectedAmountNanos: number
): Promise<VerifyResult>;
```

### Verification pipeline

1. **Input validation** — `txHashHex` must be 64 hex chars (32 bytes).
   Reject early with `invalid-hex` on anything else.

2. **Encode tx ID** — Convert hex → base58check using DeSo's format:
   `bs58.encode([0xcd, 0x14, 0x00] || txHash32 || sha256d(prefix||txHash32).slice(0,4))`
   This matches DeSo's `publicKeyToBase58Check` used for both pubkeys AND tx IDs.

3. **Query DeSo** — `POST https://node.deso.org/api/v1/transaction-info`
   with body `{ TransactionIDBase58Check }`.

4. **Parse response**:
   - `Transactions` array empty/missing → `tx-not-found`
   - `Transactions[0].TransactionType !== "BASIC_TRANSFER"` → `tx-not-basic-transfer`
     (rejects creator coin, NFT, diamond, etc. — must be plain DESO transfer)
   - `TransactionMetadata.TransactorPublicKeyBase58Check !== expectedSender` → `sender-mismatch`
   - No `Outputs[]` entry with `PublicKeyBase58Check === expectedRecipient` → `recipient-not-found`
   - Matching output's `AmountNanos < expectedAmountNanos` → `amount-too-low`
     (use `>=` not `==` to absorb rounding between client-computed and on-chain nanos)

5. **Return success** with `actualAmountNanos` (from the matched output)
   and `blockHashHex` (may be null if tx only in mempool).

### Fail-closed behavior

Network failure or malformed response → `deso-api-unreachable`. Route
MUST treat this as NOT verified and reject the trade. Attack scenario:
if we fail-open, an attacker could DoS `node.deso.org` at the exact
moment they POST a fake trade.

---

## Mempool vs confirmed

DeSo block time is ~1s. By the time a client-submitted tx reaches
our server via the `/api/trades` POST, it's usually already in a
block. But there can be a sub-second window where the tx is in
mempool only.

`api/v1/transaction-info` returns mempool txs with `BlockHashHex`
empty. Our `BlockInfo` check should NOT require a block — absorbing
sub-second mempool gives good UX without security loss (mempool txs
are valid signed transactions; they can't be forged).

However, if we see a tx in mempool, we should flag it. Future P2-2.5
could add a background reconciliation job that re-verifies mempool
trades after 30s to catch block-inclusion failures.

**For P2-2 scope:** accept mempool and confirmed. Return
`blockHashHex` as null for mempool, populated for confirmed. Route
handler writes it to `trades.tx_hash_block` (new column, nullable) so
reconciliation tooling can find unfinalized trades later.

### Actually — deferred to Phase 4

The `tx_hash_block` column and reconciliation are Phase 4 tooling.
For P2-2, we accept mempool silently — tx exists means tx is real,
whether in mempool or block. The only thing we don't do is fail
loudly if the tx is ONLY in mempool (that would break UX for fast
trades).

---

## Schema changes (P2-2.3 migration)

```sql
-- Prevent replay: same tx_hash cannot be used twice
ALTER TABLE trades
  ADD CONSTRAINT trades_tx_hash_unique UNIQUE (tx_hash);

-- Make tx_hash non-nullable going forward. Existing NULL rows are
-- legacy (pre-P2-2) and grandfathered via a NOT VALID constraint
-- if any NULL rows exist at migration time.
-- (Caldera has only test trades so far; expected to have few/zero
-- NULLs. Query before migrating.)
```

### Legacy NULL handling

Pre-P2-1 trades may have NULL `tx_hash`. Query first:
```sql
SELECT COUNT(*) FROM trades WHERE tx_hash IS NULL;
```

If count > 0, use a sentinel string like `LEGACY-PRE-VERIFY-{id}`
to backfill before adding NOT NULL. Preserves row history, satisfies
the constraint, makes legacy rows identifiable.

---

## Route integration (P2-2.4)

In `/api/trades/route.ts`, after the P2-1.5 `getAuthenticatedUser`
check and body parse, BEFORE any DB writes:

```ts
const authed = getAuthenticatedUser(req);
if (!authed) return 401;
const desoPublicKey = authed.publicKey;

// NEW in P2-2:
const verification = await verifyDesoTransfer(
  txnHash,
  desoPublicKey,                    // sender MUST equal authed user
  PLATFORM_WALLET_PUBLIC_KEY,       // recipient MUST be platform
  expectedNanos                     // from client rate × amount
);
if (!verification.ok) {
  console.warn(`[trades] tx verification failed: ${verification.reason}`, {
    txnHash, desoPublicKey, marketId,
  });
  return NextResponse.json(
    { error: "Transaction verification failed", reason: verification.reason },
    { status: 400 }
  );
}
// Use verification.actualAmountNanos for ledger if desired; default
// to the client-claimed amount for simplicity (rate lookups stay
// server-side authoritative in Step 3).
```

Insert into `trades` table. If insert fails because of the unique
constraint on `tx_hash` (race: two concurrent requests with same
hash), Postgres returns `23505` — route handles as:
```
error.code === "23505" → return 409 Conflict with reason "duplicate-tx"
```
This closes the replay race condition at the DB layer as defense-in-
depth, independent of verifyTx.

---

## Test strategy

### Unit tests (P2-2.2)

Mock `fetch` / DeSo API responses, cover each branch:

1. Happy path — valid hash, sender/recipient/amount match → `ok: true`
2. Tx not found (empty Transactions array) → `tx-not-found`
3. Wrong tx type (CREATOR_COIN) → `tx-not-basic-transfer`
4. Sender mismatch → `sender-mismatch`
5. Recipient not in outputs → `recipient-not-found`
6. Amount too low → `amount-too-low`
7. Amount exactly equal → `ok: true`
8. Amount higher than claimed → `ok: true` (absorb rounding)
9. Network error (fetch rejects) → `deso-api-unreachable`
10. Malformed hash (not 64 hex) → `invalid-hex`
11. Empty response body → `deso-api-unreachable`

Include one fixture with the REAL response for our known-good trade
tx `3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116`
(platform received 211,416,490 nanos from `BC1YLhri...`). This
documents the live shape and keeps future refactors honest.

### Integration (P2-2.4)

Update `__tests__/api/trades-auth.test.ts` (from P2-1.5) to:
- Add test: verified tx → 200
- Add test: verification returns `sender-mismatch` → 400
- Add test: verification returns `amount-too-low` → 400
- Add test: DB returns `23505` on duplicate → 409

---

## Implementation order (sub-commits)

| Commit | Content |
|--------|---------|
| P2-2.1 | This design doc (you are here) |
| P2-2.2 | `lib/deso/verifyTx.ts` + unit tests |
| P2-2.3 | DB migration for `tx_hash` UNIQUE + NOT NULL |
| P2-2.4 | Wire `verifyDesoTransfer` into `/api/trades` + integration tests |
| P2-2.5 | AUDIT_MONEY_FLOWS.md changelog — BUY-2, BUY-3 resolved |

Merge to main when all 5 sub-commits pass + Vercel preview green +
local `npm run build` succeeds (same discipline as P2-1).

---

## Dependencies

Already installed (no new deps):
- `bs58` v5 (direct, from P2-1.2)
- `@noble/hashes` v2 (direct, from P2-1.2)

No new npm installs needed.

---

## Open questions

### OQ-1: What `expectedAmountNanos` does the route pass?

The client POSTs `amount` (USD), not nanos. The conversion to nanos
happened client-side at trade time using the DeSo rate. Server could:

- **Option A:** Trust client nanos implicitly — use `expectedNanos` =
  `amount / desoUsdRate * 1e9` at route time. Works but adds a rate
  fetch.
- **Option B:** Compute expected from authoritative rate, use ≥
  comparison with rate ± 2% tolerance to absorb rate drift during the
  1-2 second gap between client rate and server rate.

**Decision (locked):** Option B. Use server-side rate (the same rate
that `lib/fees/calculator.ts` uses for fee splits). Tolerance: ≥ 98%
of expected nanos. Below that → `amount-too-low`. Above that → pass.

This also handles the edge case where the user's wallet sent slightly
more than required (DeSo sometimes inflates by a few nanos for UTXO
change).

### OQ-2: What if the platform wallet address is rotated?

The platform wallet is a single env var (`DESO_PLATFORM_PUBLIC_KEY`).
If it rotates, historical verification checks still need to pass
against the old address. Out of scope for P2-2 (wallet rotation is a
P5+ operational concern).

### OQ-3: Rate limiting

`/api/v1/transaction-info` has no rate limit documented but
empirically DeSo public nodes tolerate ~100 req/sec. Not a concern at
current Caldera volume. If we ever hit rate limits, we'd:
- Run our own DeSo node (Phase 5+)
- Or fall back to `api/v0/get-txn` as weak existence check (not
  enough for BUY-2, but better than nothing)

---

## Related audit findings (not in P2-2 scope)

- **BUY-4:** No atomicity between on-chain tx and DB insert
  (addressed by P2-7 atomic RPC pattern + route rewrite in P3)
- **BUY-5:** Rate calculation happens client-side
  (partially addressed by OQ-1 Option B; fully in P3 route rewrite)
- **CLAIM-2:** Creator claim uses body-supplied publicKey
  (partially mitigated by P2-1; fully resolved in P3-5 + P2-5 nonce)

---

## History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-25 | Robert + Claude | Design doc created. Research confirmed api/v1/transaction-info shape, base58check encoding format, correct parsing of Outputs[]. |
