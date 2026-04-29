# SECURITY.md

**Last reviewed:** 2026-04-29
**Owner:** Robert Graham
**Scope:** Caldera prediction markets platform (caldera.market)

---

## Purpose

Operational security playbook for Caldera. Documents:

1. The threat model — what we're defending against
2. Wallet topology — hot/cold split + roles
3. Seed handling rules — what's allowed, what's not
4. Sweep playbook — moving money from hot to cold safely
5. Recovery procedures — what to do if something is compromised
6. Alert thresholds — when to investigate, when to act

Read this end-to-end before:
- Touching any DeSo wallet seed
- Running any `scripts/*` that signs transactions
- Modifying `lib/deso/server-sign.ts` or `lib/deso/transfer.ts`
- Provisioning new admin credentials

---

## 1. Threat model

### In scope (we defend against these)

- **Hot wallet seed compromise** — Vercel env leak, deploy log leak, or
  contractor with deploy access exfiltrating `DESO_PLATFORM_SEED`
- **Accidental drain** — bug in a money-path route that overpays users
  or sends to wrong address
- **Operational mistakes** — typos in sweep amounts, wrong recipient
  pubkey, deploying broken code that touches money
- **Insolvency** — platform obligations exceeding wallet balance due to
  trade volume outpacing reserves
- **Stolen admin credentials** — `caldera-admin-2026` password reuse
  or leak; ADMIN_KEYS pubkey compromise
- **Replay attacks** — old signed admin requests being re-submitted

### Out of scope (we accept these risks for MVP)

- Nation-state actors with $100k+ budget
- Physical coercion of Robert
- Sophisticated social engineering of Anthropic, Vercel, or Supabase
- Quantum compromise of secp256k1 (decades away if ever)
- Bug-bounty class vulnerabilities in DeSo blockchain itself

When users + treasury cross meaningful thresholds (defined in §6), we
re-evaluate the in/out-of-scope split and may add: multi-sig treasury,
hardware-wallet-required sweeps, formal security audit, bug bounty
program, etc.

---

## 2. Wallet topology

Three distinct wallets. **Never confuse them.**

### Hot wallet — platform operations
```
Public key:    BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7
Seed location: Vercel env var DESO_PLATFORM_SEED
Backup:        Robert maintains separately (steel backup)
Purpose:       All programmatic DeSo operations
Risk profile:  HIGH — compromised on any deploy-pipeline breach
```

Used by:
- Trade buys: receives 100% of gross DESO via user-signed BASIC_TRANSFER
- Position payouts: sends DESO to winners on claim
- Creator claim payouts: sends DESO from `unclaimed_earnings_escrow`
- Holder reward payouts: sends creator coins via CREATOR_COIN_TRANSFER
- Auto-buys: programmatically buys creator coins on every trade
- Reconciliation cron: every 6h sweep + drift check

This wallet holds operational liquidity. **It is not a treasury.** It
should hold roughly:
- Enough DESO to cover ~10 in-flight tx fees (~0.5 DESO buffer)
- Plus 1.5x expected daily user payout volume
- Plus a small float of each creator coin for holder reward claims

Excess balance gets swept to the cold wallet (§4).

### Cold wallet — treasury reserve
```
Public key:    BC1YLgjNpL3jAgsydmsksqTcnXxFZ98WgxJmBt2giFG29ettuXxjimj
Seed location: 12-word BIP39 mnemonic, paper + steel backup
Backup:        Already redundant (steel backup in addition to paper)
Purpose:       Receive sweeps from hot wallet; manual access only
Risk profile:  LOW — seed never touches a server, env var, or service
```

Generated 2026-04-29 via `scripts/generate-cold-wallet.ts` (untracked,
single-use one-shot script that prints mnemonic + pubkey to stdout
only, no disk writes).

This wallet only ever:
- **Receives** DESO from `scripts/sweep-to-cold.ts` runs
- Holds funds long-term

It NEVER:
- Signs anything programmatically (no seed in any env var, ever)
- Receives funds from external sources (only platform sweeps)
- Sends funds out (until you decide to extract revenue, manually)

### Personal wallet — Robert's, unrelated
```
Public key:    BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ
Seed location: Robert's personal storage (off-platform)
Purpose:       Personal DeSo activity, unrelated to Caldera
Rule:          NEVER referenced in platform code or env vars
```

This wallet pre-existed Caldera and stays separate. Mixing it into
platform infrastructure would conflate personal and business funds —
explicitly forbidden.

---

## 3. Seed handling rules

### Hot wallet seed (`DESO_PLATFORM_SEED`)

**Allowed:**
- Live in Vercel env vars (production + preview environments)
- Read by Next.js server-side code at runtime via `process.env`
- Used by `lib/deso/server-sign.ts` to sign transactions

**NOT allowed — automatic incident if violated:**
- Committed to git (run `git log -p | grep -i seed` periodically)
- Logged to console (audit `console.log` calls in money paths)
- Sent to error monitoring (e.g., Sentry — sanitize beforehand)
- Pasted into Slack, email, chat, screenshots
- Used in local dev `.env.local` for non-trivial testing
  (use a testnet wallet seed for dev — never reuse production seed)
- Shared with anyone, even briefly

### Cold wallet seed (paper + steel)

**Allowed:**
- Stored on the paper Robert wrote it on, in the agreed location
- Stored on the steel backup, in the agreed location

**NOT allowed:**
- Typed into ANY computer, app, password manager, note app
- Photographed, screenshotted, scanned
- Spoken aloud where a microphone could capture it
- Shared with anyone, including Anthropic AI assistants
- Stored as a backup in any cloud service (iCloud, Google Drive, etc.)
- Reconstructed from memory and re-typed (always read from paper)

If you ever need to derive the public key again, run
`scripts/generate-cold-wallet.ts` and abort after the prompt — but
better: just keep the public key noted alongside the paper.

### Admin password (`caldera-admin-2026`)

Hardcoded fallback in `lib/admin/auth.ts`. Acceptable while users = 0.

**Rotation triggers:**
- Any leak (Slack, screenshot, blog post, etc.)
- 30 days before public launch
- Any new contractor with code access leaving the project

To rotate:
1. Update `ADMIN_PASSWORD` in Vercel env (for the override path)
2. Update the hardcoded value in `lib/admin/auth.ts`
3. Deploy
4. Verify: `curl /api/admin/treasury -H "Authorization: Bearer OLD"` → 401
5. Verify: `curl /api/admin/treasury -H "Authorization: Bearer NEW"` → 200
6. Memo the rotation date in this file's "Last reviewed" line

Long-term: replace password auth with DeSo-pubkey signed challenges
(ADMIN_KEYS env var pattern, already partially implemented).

---

## 4. Sweep playbook

### When to sweep (Phase 1 policy: threshold-based, manual)

Sweep DESO from hot → cold when the treasury dashboard reports:

```
extractable.deso_nanos > 2 × operational_buffer (= 1.0 DESO)
```

After sweep, hot wallet should hold approximately:

```
1.5 × operational_buffer (= 0.75 DESO)
+ daily expected user payout volume × 1.5
```

This keeps the hot wallet provisioned for ops without accumulating
excess (which raises hot-wallet exposure risk).

For creator coins: do NOT sweep automatically. Holder reward payouts
draw from accumulated creator coin balance; the auto-buy mechanic
refills it. Excess creator coin accumulation (>10x liability) is
acceptable — creator coins are illiquid relative to DESO, and the
buy-and-hold mechanic is a feature.

### How to sweep (manual procedure)

**Step 1 — Snapshot.** Pull current state:

```bash
curl -sX GET 'https://www.caldera.market/api/admin/treasury' \
  -H 'Authorization: Bearer <admin_password>' \
  | python3 -m json.tool > /tmp/treasury-pre-sweep.json
```

Inspect `extractable.deso_nanos` and `walletBalances.deso_nanos`.

**Step 2 — Compute sweep amount.** Decide how much to move:

```
sweep_amount_nanos = extractable.deso_nanos − (1.5 × operational_buffer)
                  = extractable.deso_nanos − 750_000_000
```

Sanity: confirm `sweep_amount_nanos > 0` before proceeding.

**Step 3 — Dry-run.** Run with `--dry-run` flag:

```bash
npx tsx scripts/sweep-to-cold.ts --amount-nanos <N> --dry-run
```

This validates the amount, shows the destination address, computes
fees, but does NOT submit a transaction.

**Step 4 — Real run.** Re-execute without `--dry-run`:

```bash
npx tsx scripts/sweep-to-cold.ts --amount-nanos <N>
```

Script will:
1. Read `DESO_PLATFORM_SEED` from `.env.local`
2. Build a BASIC_TRANSFER from platform → cold
3. Sign with platform seed
4. Submit to DeSo node
5. Wait for confirmation
6. Print tx hash + Diamond block-explorer link

**Step 5 — Verify.** Re-fetch treasury snapshot:

```bash
curl -sX GET 'https://www.caldera.market/api/admin/treasury' \
  -H 'Authorization: Bearer <admin_password>' \
  | python3 -m json.tool > /tmp/treasury-post-sweep.json
diff /tmp/treasury-pre-sweep.json /tmp/treasury-post-sweep.json
```

Expected diff:
- `walletBalances.deso_nanos` decreased by `sweep_amount_nanos + tx_fee`
- `extractable.deso_nanos` decreased by approximately the sweep amount
- All `liability` fields unchanged

**Step 6 — Verify cold wallet receipt.** Check the cold wallet
balance on Diamond:

```
https://diamondapp.com/u/BC1YLgjNpL3jAgsydmsksqTcnXxFZ98WgxJmBt2giFG29ettuXxjimj
```

Or via DeSo node API:

```bash
curl -sX POST 'https://node.deso.org/api/v0/get-users-stateless' \
  -H 'Content-Type: application/json' \
  -d '{"PublicKeysBase58Check":["BC1YLgjNpL3jAgsydmsksqTcnXxFZ98WgxJmBt2giFG29ettuXxjimj"],"SkipForLeaderboard":true}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['UserList'][0].get('BalanceNanos', 0)/1e9, 'DESO')"
```

**Step 7 — Log.** Add to `docs/SWEEP-LOG.md` (create if absent):

```
| Date | Amount (DESO) | Tx hash | Pre-sweep balance | Post-sweep balance |
| --- | --- | --- | --- | --- |
| 2026-04-29 | 5.0 | abc123... | 12.3 | 7.3 |
```

---

## 5. Recovery procedures

### Hot wallet seed leak (suspected or confirmed)

**Symptoms:**
- Unexpected DESO outflows from platform wallet
- Unauthorized admin actions
- Treasury dashboard shows liabilities not matching DB state
- Reconciliation cron alerts

**Immediate response (first 30 min):**

1. **Generate new platform wallet** (use `scripts/generate-cold-wallet.ts`
   pattern, but for hot — keep this seed for env, not paper).
2. **Update `DESO_PLATFORM_SEED` and `DESO_PLATFORM_PUBLIC_KEY`** in
   Vercel (production + preview). Trigger redeploy.
3. **Drain old wallet immediately** — sweep ALL DESO + creator coins
   from compromised hot to cold (manual emergency sweep, not the
   throttled normal sweep). The attacker may already be draining;
   race for it.
4. **Disable trading** by toggling a feature flag (TODO: add this kill
   switch — Phase 3 work).
5. **Notify users** if any user funds were affected. (At MVP scale,
   this is unlikely; verify via reconciliation logs.)

**Stabilization (next 24 hours):**

- Audit how the seed leaked (Vercel access logs, deploy history,
  GitHub Actions logs)
- Rotate ALL secrets that share a leak vector (admin password,
  ADMIN_KEYS, Supabase service role key, etc.)
- Review reconciliation logs for the affected window
- Compute exact loss; if any, compensate users from cold wallet

### Cold wallet seed loss

**If both paper and steel backup are destroyed:**

This is a **catastrophic** scenario — funds in the cold wallet are
unrecoverable. The blockchain has no recovery mechanism for lost
private keys.

**Mitigation:**
- Maintain steel backup in a different physical location than paper
- Consider a third backup (in a fireproof bag, with a trusted person,
  or in a safe deposit box) once treasury exceeds $10k

**If only paper is destroyed (steel intact):**
1. Generate replacement paper backup from steel
2. Verify by deriving public key, confirming match with on-chain
   address
3. Resume normal operations

### Cold wallet seed exposure (someone saw it)

If you believe anyone (even briefly) saw the seed phrase:

1. **Generate a new cold wallet** via `scripts/generate-cold-wallet.ts`
2. **Sweep ALL funds** from old cold → new cold immediately, using
   the old paper seed one final time (you'll need to enter it into
   a one-shot signer; design TBD — until then, treat seed exposure
   as a $X loss event)
3. **Destroy old paper + steel backup**
4. **Update SECURITY.md** with new pubkey, mark old as compromised
5. **Update sweep script** with new destination

### Admin password leak

1. Rotate per §3 procedure
2. Audit access logs for the leak window:
   - Vercel deploy logs
   - GitHub commit history
   - Slack DMs / public channels
3. Audit `/api/admin/*` route access for the leak window

---

## 6. Alert thresholds (Phase 1: manual)

Until Phase 3 brings automated monitoring, these are checked manually
on each treasury dashboard inspection.

### Critical (drop everything, investigate now)

- Treasury dashboard `status.deso === 'insolvent'` AND extractable
  is materially negative (>0.5 DESO underwater)
- Any creator coin status `'unknown'` for >24h (suggests price oracle
  outage or coin de-listing)
- Reconciliation cron failed twice in a row
- Hot wallet balance below operational buffer (0.5 DESO) — payouts
  may start failing

### Warning (investigate within 24h)

- Treasury dashboard `status.deso === 'tight'` (<0.5 DESO above buffer)
- Hot wallet balance growing >2x buffer with no recent sweep
- Any holder reward / creator claim / position payout pending >7 days
- Drift check finds discrepancy between DB and on-chain

### Informational

- New treasury dashboard warnings array contains entries
- Auto-buy slippage above 5% on any single creator coin
- Reconciliation cron runtime exceeding 30s

### When users + treasury thresholds are crossed, re-evaluate

| Condition | Action |
|---|---|
| First real user signs up | Tighten admin password rotation cadence |
| Treasury > $1k | Schedule quarterly SECURITY.md review |
| Treasury > $5k | Add multi-sig to cold wallet withdrawals |
| Treasury > $10k | Add a third seed backup (geographic separation) |
| Treasury > $25k | Engage formal security audit |
| Daily volume > $100 | Automate sweep cron (currently manual) |
| Daily volume > $1k | Add hot-wallet kill switch + alerting |

---

## 7. Operational checklists

### Pre-deploy (before merging to main)

- [ ] No `console.log(seed)` or similar in money-path code
- [ ] No new dependencies that could exfiltrate env vars
  (`postinstall` scripts, network calls, etc.)
- [ ] All money-path routes have tests
- [ ] tsc clean
- [ ] All Supabase migrations reviewed for `DROP`/`TRUNCATE`
- [ ] No references to personal wallet pubkey in platform code

### Post-incident

- [ ] Document timeline in this file
- [ ] Rotate affected secrets
- [ ] Run reconciliation; resolve any drift
- [ ] Update threat model if new attack surface discovered
- [ ] Communicate to users if funds affected

### Quarterly review (or after any major change)

- [ ] Update "Last reviewed" date at top of this file
- [ ] Re-check wallet topology (pubkeys still match?)
- [ ] Audit access logs for unusual patterns
- [ ] Review alert thresholds — still appropriate?
- [ ] Test the recovery procedures (do a paper-restore drill)

---

## 8. Document history

| Date | Change | Author |
|---|---|---|
| 2026-04-29 | Initial draft. Wallet topology locked. Cold wallet generated (BC1YLgjNpL...). Sweep policy: threshold-based, manual. Cold backup: paper + steel (already redundant). | Stream 3 |
