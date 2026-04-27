# P4 — Reconciliation Tooling Design

**Status:** Design (not yet implemented)
**Branch:** `feat/p4-reconciliation`
**Author:** Robert + Claude Sonnet 4.6
**Date:** 2026-04-27

---

## Premise

Phase 3 gave us atomic, ledgered, idempotent money paths. Every claim writes a row to an audit table (`position_payouts`, `holder_rewards`, `creator_claim_payouts`). Every status transition is observable. Every on-chain transfer is preceded by a state lock and followed by a finalization update.

But edge cases remain. There is one specific pattern that current code cannot self-recover from:

> **The post-send UPDATE failure.** `transferDeso()` succeeds. The on-chain transaction is mined. Then the final UPDATE to `claim_status='claimed'` fails (DB connection blip, Postgres restart, network flake). The route logs CRITICAL, returns 500, but the row stays `in_flight` forever. The user got their DESO, the ledger does not know it.

This row is now indistinguishable from one where the transferDeso never landed. It cannot be retried (idempotent UPDATE pattern guards against that). It cannot be claimed again (status is not in `pending` or `failed`). It is stuck.

Without reconciliation, the only fix is manual SQL editing. With reconciliation, an automated sweep verifies the on-chain state and transitions the row to its rightful terminal status.

---

## Scope

**In:**
- Detect and recover stuck `in_flight` rows across the three audit tables.
- Detect drift between cumulative on-chain platform-wallet outflows and the sum of `claim_status='claimed'` ledger rows. Surface as alerts.
- Admin endpoint for manual triggering.
- Cron schedule for automatic sweeping.
- Drift-alert log table and minimal write path.

**Out:**
- Refund flows (cancelled markets, mistaken trades).
- Auto-unblock of `blocked_insolvent` rows after wallet top-up. (Manual admin step. Could automate later as a separate cron.)
- A full admin UI dashboard. We log to a table; UI deferred.
- Reconciling user-side balances (e.g., user wallet show $5 less than expected). Not in our scope; that's user-app concern.
- Slack/email alerting integrations. Surface alerts in the DB; consumer routes deferred.

---

## Audit tables in scope

| Table | Status field | Terminal states | Non-terminal | Tx hash field |
|---|---|---|---|---|
| `position_payouts` | `claim_status` | `claimed`, `failed`, `blocked_insolvent` | `pending`, `in_flight` | `claim_tx_hash` |
| `holder_rewards` | `status` | `claimed`, `failed`, `blocked_insolvent` | `pending`, `in_flight` | `claimed_tx_hash` |
| `creator_claim_payouts` | `status` | `paid`, `failed` | `pending`, `in_flight` | `tx_hash` |

`failed` and `blocked_insolvent` are terminal **for the sweep purposes** — the user can retry `failed` (P3-3.6 idempotent UPDATE allows it) or wait for manual intervention on `blocked_insolvent`. The sweep should not touch them.

`in_flight` is the target. It means "we sent the transfer, we're waiting on the result." If that wait has exceeded the staleness threshold, it's stuck.

`pending` rows that are old are NOT stuck. They are just users who haven't clicked Claim yet. Sweep ignores them.

---

## Reconciliation strategy

For each `in_flight` row whose age exceeds the staleness threshold:

1. Read the row's `tx_hash` field.
2. If `tx_hash` is null: this is a state machine bug — log a CRITICAL drift alert and skip. Should be impossible after P3-3.
3. Call `verifyDesoTransfer(txHash, expected_sender, expected_recipient, expected_nanos)` from `lib/deso/verifyTx.ts` (P2-2 primitive).
4. Match on the result:
   - `confirmed` → write final UPDATE for `claim_status='claimed'` (or `paid` for creator). Log INFO.
   - `submitted_pending` → leave row as `in_flight`. Will be retried next sweep. Log INFO.
   - `not_found` → tx never landed. Transition to `failed` with reason `"reconciliation: tx not found on chain"`. Log WARN.
   - `error` → DeSo API down. Leave row alone, retry next sweep. Log WARN.

The sweep is **idempotent** — running it twice is safe because each UPDATE includes `WHERE status = 'in_flight'`. A racing concurrent sweep that already transitioned a row will leave it alone.

---

## Drift detection

Beyond per-row reconciliation, we want a coarse-grained sanity check:

> Does the sum of all `claim_status='claimed'` rows' `payout_amount_nanos` match the cumulative outflows from the platform wallet?

If our ledger says we paid out 500M nanos but the on-chain record says we paid 600M nanos, something's missing. Investigate.

This check runs alongside reconciliation but has a much higher tolerance threshold. We expect:

- Network fees (each tx ~168 nanos) are NOT in our ledger; they're in the on-chain receipt. Sum will diverge by ~168 × num_claims.
- Tiny rounding (BigInt vs Numeric serialization in Postgres) can cause sub-nano drift.
- USD-to-nanos conversion at claim time uses live rate; sums calculated at recheck time use a different rate. This creates apparent USD drift but not nanos drift.

The check should compare **nanos-out per table**, not USD. And tolerate ≤ network_fee × claim_count drift.

If drift exceeds threshold, write a `drift_alerts` row and continue. Do not auto-fix drift — humans investigate.

---

## Architecture

```
lib/reconciliation/
  sweep.ts              # core: per-row reconciliation logic
  drift-check.ts        # coarse drift detection
  index.ts              # public API: runFullReconciliation()

app/api/admin/reconcile/
  route.ts              # POST endpoint, admin-only, returns report

vercel.json             # cron schedule (every 6 hours)

drift_alerts table      # new audit table, append-only
```

### `runFullReconciliation()` flow

1. Sweep `position_payouts` for stale `in_flight` rows. Process N rows max per run.
2. Sweep `holder_rewards` for stale `in_flight` rows. Process N rows max per run.
3. Sweep `creator_claim_payouts` for stale `in_flight` rows. Process N rows max per run.
4. Run drift check on each table. Log alerts if needed.
5. Return aggregated report.

### Sweep limit

To avoid runaway processing on a backlog, each sweep run processes max 50 rows per table. If more exist, they wait for the next run. With 6h cadence and a hard cap, even a 1000-row backlog drains in under a week — and a 1000-row backlog is itself an alert-worthy condition.

### Admin endpoint

`POST /api/admin/reconcile`

```json
{
  "adminPassword": "...",
  "dryRun": true,           // optional, default false
  "tables": ["position_payouts", "holder_rewards", "creator_claim_payouts"]  // optional, default all
}
```

Response:

```json
{
  "ok": true,
  "report": {
    "position_payouts": { "swept": 3, "confirmed": 2, "failed": 1, "still_pending": 0, "errors": 0 },
    "holder_rewards":   { "swept": 0, "confirmed": 0, "failed": 0, "still_pending": 0, "errors": 0 },
    "creator_claim_payouts": { "swept": 1, "confirmed": 1, "failed": 0, "still_pending": 0, "errors": 0 },
    "drift": [
      { "table": "position_payouts", "ledgerSumNanos": "500000168", "onchainSumNanos": "500000336", "diffNanos": "168", "withinThreshold": true }
    ]
  }
}
```

### Cron schedule

`vercel.json` cron entry: `"0 */6 * * *"` (every 6 hours, on the hour). Vercel Pro plan supports up to 60 cron jobs and crons run every minute precision-wise; 6h is well within limits.

---

## Locked decisions

**OQ-1: Cadence — every 6 hours.**

Rationale: Most transient failures (DB blip, network flake) self-resolve within minutes. A 6-hour wait window absorbs that without manual intervention. Faster cadence (hourly) increases load on DeSo API for verifyTx calls without proportionate benefit.

**OQ-2: Stale threshold — 15 minutes.**

Rationale: 15min is long enough that any transient retry would have completed. It's short enough that an in_flight row stuck in this state will be detected by the next 6h sweep at the latest, giving a maximum stuck-time of 6h 15min. Tighter (5min) risks racing in-flight legitimate transfers.

**OQ-3: Auto-fix — yes, with full audit logging.**

Rationale: With `verifyDesoTransfer` confirming the on-chain state, we have high confidence in the recovery action. Each transition writes to drift_alerts with full context. If the system makes a wrong call, the audit trail makes manual reversal possible.

**OQ-4: Drift threshold — `network_fee_nanos × claimed_count` + 1000 nanos buffer per table.**

Rationale: Network fees are deterministic; multiply by count for the expected drift. The buffer accommodates rounding noise. If actual drift exceeds this, something real is wrong.

**OQ-5: Alert destination — `drift_alerts` table only (for now).**

Rationale: A DB table is the most defensive option. It cannot be missed (vs Slack/email which can be filtered or unread). Future UI/notification consumers read from this table. Keeps Phase 4 scope tight.

---

## Failure modes

### What if verifyTx itself fails (DeSo API down)?

The sweep skips that row, leaves it `in_flight`, retries next run. No false transitions. After 24h (4 sweep runs) of consecutive verifyTx failures, the sweep should still log a recurring drift alert noting the row is unverifiable. (We don't implement that automatic alert in MVP — it's a refinement.)

### What if cron stops running?

Vercel cron failures are visible in the Vercel dashboard. The admin endpoint (`POST /api/admin/reconcile`) is always available for manual triggering. We don't build dead-man-switch alerting yet (the surface area would balloon).

### What if the sweep introduces a bug that mass-corrupts rows?

The dry-run mode (`dryRun: true`) lets us validate behavior on the admin endpoint before a live run. The cron always runs live, but the per-run cap of 50 rows per table limits blast radius. The drift_alerts table audits every transition for forensic recovery.

### What if a stuck row's tx_hash is wrong (state machine bug)?

verifyDesoTransfer with the wrong tx_hash returns `not_found`. The sweep transitions the row to `failed`. This is correct — the user can retry the original claim. The wrong tx_hash should have triggered a code-level CRITICAL log earlier.

### What about concurrent sweeps?

The cron runs serially within Vercel. The admin endpoint can be hit while cron runs. The idempotent UPDATE pattern (`WHERE status = 'in_flight'`) ensures the second-arriving caller will see 0 rows updated and abort cleanly. Both processes complete; one is a no-op.

---

## Sub-commit plan

| # | What | Notes |
|---|---|---|
| **P4-1** | This design doc. New branch `feat/p4-reconciliation`. | (this commit) |
| **P4-2** | `drift_alerts` table migration. Live SQL. | Schema first per P3 pattern. |
| **P4-3** | `lib/reconciliation/sweep.ts` — per-table sweep functions. | Pure logic, full unit tests. |
| **P4-4** | `lib/reconciliation/drift-check.ts` — drift detection. | |
| **P4-5** | `app/api/admin/reconcile/route.ts` — admin endpoint. | Manual trigger, dry-run flag. |
| **P4-6** | `vercel.json` cron entry. | Schedule: `0 */6 * * *`. |
| **P4-7** | Tests: sweep + drift-check + endpoint. | ~30+ tests projected. |
| **P4-8** | Audit changelog update. | Closes no audit findings directly — Phase 4 is preventive infra. |

8 sub-commits. Smaller than P3-3's 13.

---

## What this doesn't fix

These are NOT addressed by Phase 4 and remain known issues:

- **`blocked_insolvent` auto-unblock.** Once the platform wallet is topped up, a separate cron should sweep these rows back to `pending`. Not in this scope.
- **Manual user refunds for cancelled markets.** Cancelled markets settle as losers (per P3-3 design); refund flow is a future product feature.
- **Slack/email/SMS alerts.** drift_alerts is a DB table; alerting consumers come later.
- **Multi-region / multi-cron coordination.** Single Vercel instance for now.
- **Performance under high load.** With <1000 active users, no concerns. At scale this design needs distributed locking for multiple recon workers.

---

## Open questions for chat-Claude

None outstanding. All 5 OQs locked above. Ready to begin P4-2.
