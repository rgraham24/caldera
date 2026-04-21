# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
- Live: https://caldera.market
- Stack: Next.js (App Router), TypeScript, Tailwind v4, Supabase, DeSo blockchain
- Deploy: git push → Vercel auto-deploys (~90s)
- Git identity: rgraham24@gmail.com / Robert Graham

## Commands
```bash
npm run dev          # start dev server (Turbopack)
npm run build        # production build
npm run lint         # ESLint
npx tsc --noEmit     # type check — run before every commit
```

No test framework is configured.

## Rules (never break these)
- Always run `npx tsc --noEmit` before committing
- Always use PATH B — platform wallet via DESO_PLATFORM_SEED, never personal seed
- Never use "burn" / "buy & burn" / "remove from circulation" language anywhere — DeSo creator coins cannot be burned. Use "holder rewards" / "buy & hold" / "price support via buyback" instead.
- Never delete markets via API if positions/trades exist — use `status='cancelled'`
- Commit message format: `feat/fix/chore: description`
- Valid market statuses: `open`, `closed`, `resolving`, `resolved`, `cancelled` — never `archived` (check constraint will reject it)

## Auth / Passwords
- Admin API password: caldera-admin-2026
- Market generate password: caldera2026
- Cron auth: Bearer caldera-cron-2026
- Supabase project: ekorhgypjdbiyhpbfzqv
- Platform wallet: BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7

## Architecture

### Routing
App Router under `app/`. Two route groups:
- `(main)/` — authenticated/public pages with TopNav layout
- `(auth)/` — login pages

Category pages (`/sports`, `/music`, `/crypto`, etc.) are top-level routes, not nested under `/categories/`.

### Key Libraries
- `lib/trading/amm.ts` — constant-product AMM engine (x*y=k) for binary YES/NO markets
- `lib/fees/calculator.ts` — fee logic; reads rates from `platform_config` table at runtime
- `lib/deso/` — all DeSo SDK interactions (never import `deso-protocol` directly elsewhere)
- `lib/resolution/sports-resolver.ts` — ESPN API integration for sports market resolution
- `lib/admin/market-generator.ts` — AI-powered market generation pipeline
- `lib/supabase/client.ts` / `server.ts` — browser vs server Supabase clients

## Token model (LOCKED 2026-04-21)

**Sells:** 0%. Always free.
**Buys:** 2.5% on ALL markets. Split:
- 1.0% → platform
- 0.5% → relevant-token holder rewards (accrual ledger, pull/claim)
- 0.5% → relevant-token auto-buy on DeSo (price support, NO burn)
- 0.5% → creator slice

Creator slice routing:
- Claimed → direct to creator's DeSo wallet
- Unclaimed → `creators.unclaimed_earnings_escrow` (released on claim; rolls to category holder rewards if unclaimed 12mo)

"Relevant token" routing:
- Crypto market → underlying coin ($BTC, $ETH, $SOL, etc.)
- Unclaimed creator market → $CalderaCreators
- Otherwise → $Caldera<Category> matching market category

8 category tokens only: $CalderaSports, $CalderaMusic, $CalderaPolitics, $CalderaTech, $CalderaEntertainment, $CalderaClimate, $CalderaCompanies, $CalderaCreators.

**NO $CalderaCrypto token.** NO burn mechanism — DeSo creator coins cannot be burned.

### Database
Key tables:
- `creators`: `slug`, `name`, `token_status`, `deso_username`, `deso_public_key`
- `markets`: `category`, `creator_slug`, `category_token_slug`, `status`
- `creator_coin_holders`: leaderboard tracking, updated via `increment_coin_holding` RPC

`token_status` values: `shadow`, `active_unverified`, `active_verified`, `claimed`, `needs_review`

### Cron Jobs (`app/api/cron/`)
Authenticated with `Bearer caldera-cron-2026`. Jobs: auto-resolve-markets, check-category-health, generate/resolve crypto markets, snapshot prices, update-trending.

## Key API Endpoints
```
POST /api/admin/generate-for-imported  { password, creatorSlug, marketsPerCreator }
POST /api/admin/generate-companies     { password }
POST /api/admin/autonomous-cycle
POST /api/markets/[id]/resolve
POST /api/trades
```

## Supabase Direct Access
For any DB task, use this pattern:
```js
// Save as /tmp/db-task.mjs, run with: node /tmp/db-task.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.from('markets').select('*').limit(5);
console.log(data, error);
```

For schema changes, apply SQL via the Supabase MCP tool or the Node pattern above using `sb.rpc('exec_sql', { sql: '...' })`.

## ESPN Free API (no auth required)
Used by `lib/resolution/sports-resolver.ts`.

Base: `https://site.api.espn.com/apis/site/v2/sports`
- NFL: `/football/nfl/scoreboard?dates=YYYYMMDD`
- NBA: `/basketball/nba/scoreboard?dates=YYYYMMDD`
- MLB: `/baseball/mlb/scoreboard?dates=YYYYMMDD`
- NHL: `/hockey/nhl/scoreboard?dates=YYYYMMDD`

Key fields: `events[].status.type.completed`, `competitions[0].competitors[].winner`

Helpers: `resolveSportsMarket(market)`, `fetchUpcomingGames(sports, daysAhead)`, `detectSport(title)`
