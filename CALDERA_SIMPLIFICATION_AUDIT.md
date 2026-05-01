# Caldera MVP Simplification — Full Audit

**Date:** 2026-05-01
**Status:** Pre-execution. Audit only — no code changes yet.
**Author:** Working session with Robert.
**Pairs with:** `AUDIT_MONEY_FLOWS.md`, `DECISIONS.md`

---

## Locked decisions (this session)

These supersede the 2026-04-21 tokenomics lock-in.

1. **Creator-first MVP only.** Crypto markets and category-token markets are deleted. Every market is attached to a single creator.
2. **New fee model (replaces 4-way 2.5% split):**
   - **2.0% buy fee** (down from 2.5%)
   - **1.0% → platform**
   - **1.0% → auto-buy of that market's creator's DeSo coin**
     - Claimed creator: bought coins sent directly to creator's wallet on each trade
     - Unclaimed creator: bought coins held in platform wallet, accumulating as a "claim bounty"
   - **Sells: 0%** (unchanged)
3. **Holder rewards system: deleted.** No more 0.5% holder-rewards slice. No more category-token holder pools. No more snapshot-on-trade. No more pull-claim flow.
4. **Category tokens: deleted.** All 8 of them ($CalderaSports, $CalderaMusic, $CalderaPolitics, $CalderaTech, $CalderaEntertainment, $CalderaClimate, $CalderaCompanies, $CalderaCreators).
5. **"Relevant token" routing system: deleted.** Every market routes to one place — the creator's coin.
6. **12-month escrow rollover: deleted.** Unclaimed creator escrow stays put forever.
7. **Crypto markets: deleted.** No $BTC/$ETH/$SOL price-target markets in MVP.

**Narrative:** *"Caldera is a prediction market for creators. 2% fee on buys — 1% runs the platform, 1% buys the creator's coin. Sells are free. Creators always benefit, whether they've claimed their profile or not."*

---

## Phase B scope (your current task)

Phase A (Phase A landing pages, crypto cron jobs, category routes) is already merged. Phase B is the tokenomics rewrite.

### Files to DELETE in Phase B

**Library code:**
- `lib/fees/relevantToken.ts` (159 lines) — full delete
- `lib/fees/holderSnapshot.ts` (297 lines) — full delete

**API routes:**
- `app/api/holder-rewards/balance/route.ts`
- `app/api/holder-rewards/claim/route.ts`
- (Plus the parent dir `app/api/holder-rewards/`)

**Components:**
- `components/portfolio/PendingRewards.tsx`
- `components/shared/HolderCalculator.tsx`

**Tests:**
- `__tests__/fees/relevantToken.test.ts`
- `__tests__/fees/holderSnapshot.test.ts`
- `__tests__/api/holder-rewards-claim.test.ts`
- `__tests__/api/holder-rewards-balance.test.ts`

### Files to MODIFY in Phase B

**Library code:**
- `lib/fees/calculator.ts` — full rewrite. 4 buckets → 2 buckets. 2.5% → 2.0%. Drop holderRewards/autoBuy/creatorSlice. New shape: `{platform, creatorAutoBuy}`.
- `lib/finance/liability.ts` — strip holder-rewards liability tracking. Keep position payouts, sell payouts, creator escrow.
- `lib/reconciliation/sweep.ts` — strip holder rewards sweeps. Update fee_earnings expectations from 4 recipient types to 2.
- `lib/reconciliation/drift-check.ts` — same — strip holder rewards drift checks.

**API routes:**
- `app/api/trades/route.ts` — heavy rewrite. Write 2 fee_earnings rows instead of 4. No more snapshotHolders call. Auto-buy targets the market's creator's coin.

**UI:**
- `components/markets/TradeTicket.tsx` — update fee breakdown UI from 4-bucket to 2-bucket.
- `components/shared/FeeBreakdown.tsx` — same. Show "1% platform, 1% buys $CreatorName" copy.
- `app/(main)/portfolio/portfolio-client.tsx` — strip "Pending Rewards" section.
- `app/(main)/creators/[slug]/creator-profile-client.tsx` — strip HolderCalculator usage if any.

**Copy:**
- `app/(main)/terms/page.tsx` — Section 6 rewrite. Remove "manual claim accrued rewards." Update fee math.
- `components/layout/Footer.tsx` — update fee narrative. Change 2.5% to 2.0%.
- `app/(main)/how-it-works/page.tsx` — update.
- `components/how-it-works-modal.tsx` — update.
- `README.md` — update tokenomics blurb if present.

**Tests:**
- `__tests__/fees/calculator.v2.test.ts` — rewrite for new 2-bucket math.
- `__tests__/api/trades-atomicity.test.ts` — change expectation from 4 fee rows to 2.
- `__tests__/api/trades-crypto-creator.test.ts` — likely delete (tests deleted relevantToken routing).

**Schema (migration files only — Robert runs the SQL):**
- `docs/migrations/PB-1-atomic-record-trade-v2.sql` — new RPC writing 2 fee rows
- `docs/migrations/PB-2-fee-earnings-recipient-types-v2.sql` — narrow CHECK constraint
- `docs/migrations/PB-3-archive-holder-rewards.sql` — archive + drop holder_rewards table
- `docs/migrations/PB-4-archive-dormant-tables.sql` — archive + drop caldra_*, coin_holder_distributions
- (Optional B.2.5) `docs/migrations/PB-5-fee-earnings-coin-transfer-cols.sql` — adds tx_hash + status cols

**Documentation:**
- `DECISIONS.md` — append 2026-05-01 entry locking the new tokenomics.
- `AUDIT_MONEY_FLOWS.md` — append changelog entry noting REWARDS-1 through REWARDS-7 are moot, fee model changed.

### Files to KEEP unchanged in Phase B

- All `lib/auth/*` — out of scope.
- All `lib/deso/*` primitives (`buyback.ts`, `transfer.ts`, `transferDeso.ts`, etc) — they're consumed by the new code, but not modified themselves.
- `lib/markets/resolution.ts` — out of scope.
- `lib/creators/claim-payout.ts` — out of scope.
- All `app/api/trades/sell/route.ts` — out of scope.
- All resolution routes — out of scope.
- All creator claim routes — out of scope.

### Important DON'Ts

- Don't drop `creators.unclaimed_earnings_escrow` column. Legacy data lives there. Just stop incrementing it on new trades.
- Don't touch `holder_snapshots` or `holder_distributions` tables (zero rows but not in scope — Phase D handles them).
- Don't touch sell route, resolution route, or creator claim route — those are different money paths.
- Don't drop the existing `P3-1-2-atomic-record-trade.sql` file. Write the new one as `PB-1-atomic-record-trade-v2.sql` alongside it.

---

## Risks to flag during execution

1. **Existing crypto markets** — 998/1000 markets are tagged crypto per old data. They need a hard cutover (cancel + refund original stake) but that's an ADMIN OPERATION done after Phase B merges, not part of the code rewrite itself. Don't try to handle this in code.
2. **Creator coin price volatility** — when the platform auto-buys an unclaimed creator's coin, it pays current price. Document this clearly in `terms/page.tsx`.
3. **Per-creator platform-held coin balance tracking** — locked decision is to AGGREGATE from `fee_earnings` table (single source of truth). No new column on `creators`. SQL view: `v_creator_held_coin_balance` (build later, not Phase B).

---

*End of audit.*
