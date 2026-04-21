# Caldera Decisions Log

Append-only. Newest at top. Never edit or delete past entries — if a decision reverses, add a new entry referencing the old one.

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

## 2026-04-15: Path B for creator accounts
Platform holds DeSo accounts via DESO_PLATFORM_SEED for pipeline-discovered creators. Creators claim ownership via /claim/[code] with CALDERA-XXXX-XXXX codes posted publicly. Unclaimed earnings accrue in creators.unclaimed_earnings_escrow.

## 2026-04-15: Vercel Pro required
Needed for 300s function timeouts and 6x/day cron jobs. $20/month.
