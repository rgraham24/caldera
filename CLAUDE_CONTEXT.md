# Caldera — Context for Claude

## What Caldera Is

Caldera is a crypto-native prediction market platform where users bet YES/NO on outcomes using real DeSo (a blockchain). Every market is tied to a creator — an athlete, musician, influencer, or public figure — whose DeSo creator coin benefits from trading fees via a "buy & burn" mechanic. Users buy shares in prediction markets, the AMM adjusts prices, and winners receive payouts in DeSo. The platform differentiates from Polymarket/Kalshi by layering DeSo's social graph and creator coin economy on top of standard binary prediction markets, with creator tiers, claim codes, and reputation scores.

---

## Stack & Infrastructure

- **Frontend/Backend:** Next.js 16.2.2 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui
- **Database:** Supabase (PostgreSQL) — project ref: `ekorhgypjdbiyhpbfzqv`
- **Blockchain:** DeSo (`deso-protocol` SDK v3.4.1) — platform wallet holds all DeSo; server-side tx signing via `lib/deso/server-sign.ts` (BIP39 mnemonic → secp256k1)
- **Deploy:** Vercel (auto-deploys on `git push` to `main`, ~90s)
- **Repo:** https://github.com/rgraham24/caldera
- **Local path:** `~/Dropbox/My Mac (MacBook-Pro.lan1)/Downloads/rankio/caldera`
- **Live URLs:** https://caldera.market
- **Git identity required:** `rgraham24@gmail.com` / Robert Graham

---

## Fee Model (as actually implemented in `lib/fees/calculator.ts`)

**Buy trades:**

| Scenario | Total fee | Platform | Creator wallet | Token auto-buy pool |
|---|---|---|---|---|
| Unclaimed creator | 2.0% | 1.0% | 0% | 1.0% |
| Claimed creator | 2.5% | 1.0% | 0.5% | 0.5% |

**Sell trades:** 0% fee, always free.

**Token auto-buy pool distribution** (the 1% or 0.5% remaining):
- Split equally among active tiers: personal, team, league
- **Personal token** only gets a cut if `token_status === "active_verified"` OR `"claimed"` AND `creator_coin_price > 0`
- **Team/League tokens** qualify if `token_status` is `"active_unverified"` | `"active_verified"` | `"claimed"` AND `coin_price > 0`
- **Personal token blocked** (`personalTokenBlocked = true`): when creator is `active_unverified` with a coin price > 0 — their personal cut is rerouted to team/league to protect unclaimed celebrities from Caldera-driven price appreciation
- **Community pool**: receives the full auto-buy pool if no active tokens qualify

**Where fees flow in the database:**
- `fee_earnings` table: up to 3 rows per trade (`recipient_type` = `'platform'` | `'creator'` | `'market_creator'`)
- `coin_holder_distributions` table: auto-buy pool amounts (personal/team/league/community), with `per_coin_amount`
- `buyback_events` table: fire-and-forget record of each buyback execution
- `creators.total_fees_distributed`: incremented after each coin_holder_distributions insert
- Actual DeSo buyback: executed server-side via `executeCreatorCoinBuyback()` in `app/api/trades/route.ts` — calls DeSo `buy-or-sell-creator-coin`, signed with `lib/deso/server-sign.ts`

**`FeeBreakdown` type fields:** `total`, `platform`, `creatorEarning`, `creatorWalletFee`, `personalToken`, `teamToken`, `leagueToken`, `communityPool`, `personalTokenBlocked`, `isClaimed`, `labels` (DeSo usernames like `$elonmusk`). Legacy compat fields also present: `grossAmount`, `platformFee`, `creatorFee`, `coinHolderPoolFee`, `totalFee`, `netAmount`.

---

## Creator Tier System

Defined in `creators.token_status` column. Values:

| Status | Meaning |
|---|---|
| `shadow` | Imported/discovered but not yet processed — not visible to users |
| `pending_deso_creation` | Approved by admin, queued for DeSo profile creation |
| `active_unverified` | DeSo profile created, token exists, creator hasn't claimed yet — personal token auto-buy **blocked** |
| `active_verified` | Verified, personal token auto-buy **enabled** |
| `claimed` | Creator claimed their profile via CALDERA-XXXX-XXXX code — gets 0.5% wallet fee + 2.5% total |
| `needs_review` | Flagged for manual review |

Separate from `token_status`, there is also `claim_status` (on `creators` table, added in `20260414_verification_system.sql`):
- `unclaimed` — claim code generated, not yet used
- `pending_claim` — tweet verified, awaiting DeSo wallet signature
- `claimed` — successfully claimed

And `verification_status`:
- `unverified` | `pending_review` | `approved` | `rejected`
- Only `approved` creators can proceed to claim

---

## Claim Flow

End-to-end, as implemented in `app/api/claim/`:

1. **Admin approves creator** via `/api/admin/verify-creator` → sets `verification_status='approved'`, generates a `CALDERA-XXXX-XXXX` claim code, sets `claim_status='unclaimed'`

2. **Creator looks up their code** via `GET /api/claim/[code]` → returns `unclaimed_earnings_usd`, `markets_count`, token symbol (no auth required)

3. **Tweet verification** via `POST /api/claim/tweet-verify` → Brave Search API scans Twitter/X for a tweet containing the claim code from the creator's handle. On success, sets `claim_status='pending_claim'`. **Dev bypass:** if `BRAVE_SEARCH_API_KEY` is absent, verification is granted automatically.

4. **Final claim** via `POST /api/claim/verify` → requires `{ code, desoPublicKey, desoUsername? }`. Validates `claim_status='pending_claim'`. On success:
   - Sets `claim_status='claimed'`, `token_status='claimed'`, `claimed_at=now()`, `claimed_deso_key=desoPublicKey`
   - Upserts `users` row with `is_creator=true`, `creator_id`
   - Updates legacy `claim_codes` table if old system code

**Two parallel claim systems exist:** new (`claim_code` on `creators` table, `20260414` migration) and legacy (separate `claim_codes` table, `20260408` migration). Both are supported in the claim route.

**`unclaimed_earnings_escrow`**: column on `creators` table (added in `004_creator_tiers_achievements.sql`). Tracks accumulated USD earnings before claim. What happens to it on claim (distribution to creator wallet) is not yet fully implemented in code — the column exists as a placeholder.

**No frontend claim page exists** (`app/(main)/claim/` does not exist). The claim API routes are live but there is no UI.

---

## Trading Lifecycle

**Buy flow** (`POST /api/trades`):
1. Validate request (marketId, side, amount, desoPublicKey)
2. Upsert user by desoPublicKey (creates if not found, username = first 8 chars of key)
3. Check market is `status='open'`
4. Calculate AMM quote (`lib/trading/amm.ts`)
5. Calculate fees (`lib/fees/calculator.ts`)
6. Verify DeSo payment was received (txnHash checked or platform wallet used)
7. Update market pools and prices in `markets` table
8. Insert `market_price_history` snapshot (fire-and-forget)
9. Insert row in `trades`
10. Upsert `positions` (quantity, avg_entry_price, total_cost, fees_paid)
11. Insert `fee_earnings` rows
12. Insert `coin_holder_distributions` row
13. Insert `buyback_events` row + execute DeSo buyback (fire-and-forget, non-fatal)
14. Return quote result

**Sell flow** (`POST /api/trades/sell`):
1. Look up user, market, open position
2. Calculate return amount = shares × current price, realized PnL
3. Update or close position in `positions`
4. **Best-effort DeSo payout**: fetch exchange rate → `send-deso` → sign via `lib/deso/server-sign.ts` → submit. If any step fails, sell still succeeds.
5. Insert sell record in `trades` (0 fees, wrapped in try/catch — non-fatal)
6. Return `{ sharesSold, returnAmount, realizedPnl, newQuantity, payoutTxnHash }`

**Resolution**: Markets are resolved via `/api/admin/resolve-market`. Resolution triggers `market_resolutions` insert and settlement of positions. Settlement logic (distributing winnings to YES or NO holders) — exact implementation in the resolve route, not audited in detail here.

**What doesn't exist yet:**
- Sell flow does not decrement `creator_coin_holders` (known TODO in CLAUDE.md)
- `unclaimed_earnings_escrow` distribution on claim not implemented
- No frontend claim page

---

## What's Shipped

- Binary YES/NO prediction markets with AMM pricing
- Market browsing, filtering, and detail pages
- TradeTicket component: buy/sell modes, fee breakdown, success state with share-to-X
- Portfolio page: open positions, settled, watchlist, DeSo coin holdings tab
- Leaderboard page
- Admin dashboard: create/resolve/feature markets, verify creators, generate markets via AI pipeline
- DeSo login via identity window
- Server-side DeSo transaction signing (`lib/deso/server-sign.ts`) replacing browser-only identity.deso.org
- Creator tiers and token auto-buy fee routing
- Claim code generation (admin side)
- Tweet verification API for claims
- Claim verify API
- Category pages (sports, music, politics, entertainment, companies, climate, tech, creators)
- Creator coin holdings in portfolio (`/api/portfolio/coins` via DeSo `UsersYouHODL`)
- Creator profiles with verification badges
- Autonomous market generation pipeline
- ESPN sports score resolution
- StakeModal for buying/selling creator coins
- Real DESO payout on sell (best-effort)

---

## What's NOT Shipped Yet

- **Frontend claim page** — `app/(main)/claim/` does not exist; claim APIs exist but no UI
- **Sell flow does not decrement `creator_coin_holders`** — known TODO
- **`unclaimed_earnings_escrow` distribution on claim** — column exists, logic not implemented
- **Market-locked-behind-token mechanic** — planned but not built
- **`/companies` page stale "All 10" count** — known bug
- Creator profile pages (`/creators/[slug]`) are limited
- No public market creation UI (admin only)
- No notifications page
- No mobile app
- No email/push notifications
- Climate category markets not yet generated

---

## Technical Debt & Known Issues

- **Two parallel claim systems**: `claim_codes` table (legacy) and `claim_code` column on `creators` (new). Both active simultaneously, both supported in claim route. Should consolidate.
- **`unclaimed_earnings_escrow`**: exists in DB schema but not wired into any distribution logic.
- **Sell payout is best-effort non-fatal**: if DeSo `send-deso` or signing fails, user's position is closed in DB but they may not receive their DeSo back. No retry mechanism or reconciliation job.
- **User auto-creation on buy**: if a `desoPublicKey` is not found in `users`, a new user is created with username = first 8 chars of the public key. This is a silent upsert with no notification.
- **Dev tweet verification bypass**: if `BRAVE_SEARCH_API_KEY` is not set, tweet verification is skipped entirely — any claim code will pass. Must ensure env var is set in production.
- **`010_caldra_token.sql` migration**: creates `caldra_token`, `caldra_holdings`, `caldra_trades` tables that are permanently dormant (see Decisions below). These tables exist in production Supabase and in `database.types.ts` but are referenced by zero application code.
- **`calculateFees()` legacy wrapper**: calls `calculateMarketFees()` with zeroed-out creator data (coin_price=0), so it always routes to community pool. Fine for old callers, but callers should migrate to `calculateMarketFees()` with real creator data.
- **Admin password in CLAUDE.md plaintext**: `caldera-admin-2026`. Not in env var.
- **`status='archived'`**: not a valid market status (check constraint rejects it). CLAUDE.md explicitly forbids using it. Only valid statuses: `open`, `closed`, `resolving`, `resolved`, `cancelled`.

---

## Decisions That Keep Resurfacing

- **NO $CALDRA token exists.** The `caldra_token`, `caldra_holdings`, and `caldra_trades` tables are dormant schema artifacts only. No live code references them. Do not build any UI or logic around a $CALDRA platform token.

- **PATH B chosen**: the platform holds DeSo accounts for pipeline-discovered creators. The platform wallet (`DESO_PLATFORM_SEED`) signs all transactions server-side. Never use a personal seed. Never use `identity.deso.org` (browser-only endpoint).

- **"Buy & burn" not "passive income"**: fee auto-buys are always described as "buy & burn" in all user-facing copy. Never say "passive income."

- **Never delete markets** via API if positions/trades exist. Use `status='cancelled'` instead. `status='archived'` is not a valid value.

- **Sell fees are always 0%**. Do not add sell fees.

- **Commit format**: `feat/fix/chore: description` — always.

- **Always run `npx tsc --noEmit` before committing.**

---

## Key File Locations

| File | Purpose |
|---|---|
| `lib/fees/calculator.ts` | Single source of truth for all fee math — read this before touching fee logic |
| `lib/deso/server-sign.ts` | Server-side DeSo tx signing via BIP39 mnemonic — used by buy and sell routes |
| `lib/trading/amm.ts` | AMM constant-product pricing engine |
| `app/api/trades/route.ts` | Buy trade endpoint — AMM update, fee distribution, buyback execution |
| `app/api/trades/sell/route.ts` | Sell trade endpoint — position close, best-effort DESO payout |
| `app/api/claim/[code]/route.ts` | Look up claim code info |
| `app/api/claim/verify/route.ts` | Final claim step — sets claimed status |
| `app/api/claim/tweet-verify/route.ts` | Tweet verification step |
| `app/api/admin/verify-creator/route.ts` | Approve creator + generate claim code |
| `app/api/admin/autonomous-cycle/route.ts` | AI market generation pipeline |
| `app/api/portfolio/coins/route.ts` | DeSo creator coin holdings via `UsersYouHODL` |
| `app/(main)/portfolio/portfolio-client.tsx` | Portfolio page with inline trade modals |
| `components/markets/TradeTicket.tsx` | Buy/sell trade UI component |
| `components/markets/StakeModal.tsx` | Creator coin buy/sell modal |
| `components/TokensPage.tsx` | Category + creator token listing page |
| `types/database.types.ts` | Auto-generated Supabase types — do not edit manually |
| `lib/fees/calculator.ts` | Fee calculator |
| `supabase/migrations/` | All schema migrations (17 files) |
| `CLAUDE.md` | Core rules, auth credentials, current priorities |

---

## How to Run Locally

```bash
npm install
cp .env.local.example .env.local
# Fill in all env vars (see below)
npx supabase db push        # run migrations
npm run dev                 # http://localhost:3000
```

**Required environment variables (names only — never commit values):**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_DESO_APP_NAME
NEXT_PUBLIC_DESO_REDIRECT_URI
NEXT_PUBLIC_APP_URL
DESO_PLATFORM_SEED           # BIP39 mnemonic for platform wallet — signs all txns server-side
DESO_PLATFORM_PUBLIC_KEY     # Platform wallet public key
NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY
BRAVE_SEARCH_API_KEY         # For tweet verification in claim flow (bypass active if absent)
NEXT_PUBLIC_PLATFORM_WALLET  # Same as DESO_PLATFORM_PUBLIC_KEY, public-facing
DESO_NODE_URL                # Optional — defaults to https://node.deso.org
```

**Admin API password:** stored in `CLAUDE.md` (not in env) — required for all `/api/admin/*` endpoints.

**Supabase project ref:** `ekorhgypjdbiyhpbfzqv`
