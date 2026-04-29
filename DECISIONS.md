# Caldera Decisions Log

Append-only. Newest at top. Never edit or delete past entries — if a decision reverses, add a new entry referencing the old one.

---

## 2026-04-29: Cleanup backlog — token symbol surfaces

5. **Slug-derived token symbols in non-priority surfaces.**
   Three sites still display token symbols by deriving from slug rather than using `getTokenSymbol()` helper. All lower-traffic / not-yet-launched:
   - `app/(main)/admin/admin-actions.tsx:700` — admin-only UI
   - `app/api/markets/[id]/share-card/route.ts:83` — OG share card image
   - `app/api/claim/[code]/route.ts:26,65` — claim flow API response
   Migrate when touching these surfaces for other reasons.

6. **`symbol` prop on HolderCalculator may be redundant.**
   Post Session-1-followup, the prop is no longer used in the rewards paragraph (replaced by `getTokenSymbolDisplay({ slug: creatorSlug })`). It may still be used elsewhere in the component. Audit and remove if fully unused.

---

## 2026-04-16: No $CALDRA token
We are NOT launching a $CALDRA token. The caldra_token, caldra_holdings, and caldra_trades tables in Supabase are dormant schema artifacts from an earlier exploration. No live code references them. They will be dropped in a future migration but kept for now to avoid breaking anything.

## 2026-04-21: Tokenomics locked

Sells are always 0%, always free. Buys are 2.5% on every market (unclaimed AND claimed — same rate, different routing). Split: 1.0% platform, 0.5% relevant-token holder rewards (accrual ledger, pull/claim), 0.5% relevant-token auto-buy on DeSo (price support, NO burn), 0.5% creator slice.

The creator slice routes to the claimed creator's DeSo wallet if claimed, otherwise accrues in `creators.unclaimed_earnings_escrow`. Escrowed earnings release to the creator when they claim via the CALDERA-XXXX-XXXX flow; if unclaimed after 12 months, the escrow rolls over to the relevant category token's holder rewards pool. Escrow never expires to zero.

"Relevant token" is routed per market type: crypto markets route to the underlying DeSo coin ($BTC, $ETH, $SOL, etc.); unclaimed creator markets route to $CalderaCreators; all others route to $Caldera<Category> matching the market's category. There are exactly 8 category tokens: $CalderaSports, $CalderaMusic, $CalderaPolitics, $CalderaTech, $CalderaEntertainment, $CalderaClimate, $CalderaCompanies, $CalderaCreators. There is NO $CalderaCrypto token — crypto fees route directly to the underlying asset's DeSo coin.

No burn mechanism exists anywhere. DeSo creator coins cannot be burned. The 0.5% auto-buy is a buyback that provides price support only — supply is never reduced. All prior "buy & burn" / "permanent removal from circulation" language is banned across site copy, terms, docs, and comments. The old CLAUDE.md rule mandating "buy & burn" language is INVERTED as of this entry.

Holder rewards distribute via an accrual ledger (to be built). Per-trade push distributions are economically unworkable (gas > reward at penny-level per-trade values), so holders pull accrued rewards via a Claim action. Snapshot/anti-gaming rules TBD in implementation.

Supersedes the 2026-04-16 stub. Reverses the 2026-04-15 / earlier "buy & burn" framing.

## 2026-04-21 — Step 3a complete (v2 fee_earnings live on preview)

Shipped on `feat/tokenomics-v2` branch:
- `lib/fees/relevantToken.ts` — resolves which DeSo token receives holder-rewards + auto-buy (commit 6671d0c, fixed 1303d11)
- `lib/fees/calculator.ts` — locked v2 math: 2.5% flat, 4-way split, 8-decimal `round()`, `authoritativeTotal = sliceSum` invariant (commits 4a5227c, e57c206)
- `supabase/migrations/20260421b_fee_earnings_recipient_types.sql` — expands `fee_earnings_recipient_type_check` constraint to allow `holder_rewards_pool` and `auto_buy_pool` (commit f451495)
- `app/api/trades/route.ts` — writes 4 fee_earnings rows per buy trade instead of 3; error-checks all inserts (commits ad566cd, f451495, e57c206, 0ef6a47)
- `__tests__/fees/calculator.v2.test.ts` — full suite covering all routing paths + rounding invariant (commit e57c206)
- `__tests__/fees/relevantToken.test.ts` — 18 pure unit tests (commits 6671d0c, 1303d11)

Verified on preview deploy with real $1 trade on BTC market:
  `platform=$0.01, holder_rewards_pool=$0.005, auto_buy_pool=$0.005, creator=$0.005`

Known gaps still owed in Step 3:
- **3b:** Increment `creators.unclaimed_earnings_escrow` when `creatorSliceDestination === 'escrow'` (unclaimed creator slice currently inserted to fee_earnings but not accumulated on the creator row)
- **3c:** Per-holder snapshot writes to `holder_rewards` table (requires DeSo API paginated holder list; pull/claim model)
- **3d:** Rewire auto-buy DeSo transaction target from creator's personal coin to `relevantToken.deso_public_key`

Production is unchanged. Branch is deploy-ready only after 3b–3d land and merge to main.

## 2026-04-15: Path B for creator accounts
Platform holds DeSo accounts via DESO_PLATFORM_SEED for pipeline-discovered creators. Creators claim ownership via /claim/[code] with CALDERA-XXXX-XXXX codes posted publicly. Unclaimed earnings accrue in creators.unclaimed_earnings_escrow.

## 2026-04-15: Vercel Pro required
Needed for 300s function timeouts and 6x/day cron jobs. $20/month.
