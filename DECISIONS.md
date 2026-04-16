# Caldera Decisions Log

Append-only. Newest at top. Never edit or delete past entries — if a decision reverses, add a new entry referencing the old one.

---

## 2026-04-16: No $CALDRA token
We are NOT launching a $CALDRA token. The caldra_token, caldra_holdings, and caldra_trades tables in Supabase are dormant schema artifacts from an earlier exploration. No live code references them. They will be dropped in a future migration but kept for now to avoid breaking anything.

## 2026-04-16: Fee model finalized
[Robert — fill this in once the CLAUDE_CONTEXT.md fee section is accurate, then paste the model here as a locked-in decision]

## 2026-04-15: Path B for creator accounts
Platform holds DeSo accounts via DESO_PLATFORM_SEED for pipeline-discovered creators. Creators claim ownership via /claim/[code] with CALDERA-XXXX-XXXX codes posted publicly. Unclaimed earnings accrue in creators.unclaimed_earnings_escrow.

## 2026-04-15: Vercel Pro required
Needed for 300s function timeouts and 6x/day cron jobs. $20/month.
