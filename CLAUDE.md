# Caldera — Claude Code Context

## Project
- Live: https://caldera.market
- Local: ~/Dropbox/My Mac (MacBook-Pro.lan1)/Downloads/rankio/caldera
- Stack: Next.js 14, TypeScript, Tailwind, Supabase, DeSo blockchain
- Deploy: git push → Vercel auto-deploys (~90s)
- Git identity: rgraham24@gmail.com / Robert Graham

## Rules (never break these)
- Always run `npx tsc --noEmit` before committing
- Always use PATH B — platform wallet via DESO_PLATFORM_SEED, never personal seed
- Never use "passive income" language — always "buy & burn"
- Never delete markets via API if positions/trades exist — use status='archived'
- Commit message format: "feat/fix/chore: description"

## Auth / Passwords
- Admin API password: caldera-admin-2026
- Market generate password: caldera2026
- Cron auth: Bearer caldera-cron-2026
- Supabase project: ekorhgypjdbiyhpbfzqv
- Platform wallet: BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7

## Key API endpoints
- Generate markets for a creator: POST /api/admin/generate-for-imported
  body: { password, creatorSlug, marketsPerCreator }
- Batch generate companies: POST /api/admin/generate-companies
  body: { password }
- Autonomous pipeline: POST /api/admin/autonomous-cycle

## Database (Supabase)
- creators table: slug, name, token_status, deso_username, deso_public_key
- markets table: category, creator_slug, category_token_slug, status
- creator_coin_holders: tracks leaderboard, updated via increment_coin_holding RPC
- token_status values: shadow, active_unverified, active_verified, claimed, needs_review

## Token model
- Category tokens (buy & burn): caldera-sports, caldera-music, caldera-politics,
  caldera-entertainment, caldera-companies, caldera-climate, caldera-tech, caldera-creators
- Crypto tokens: individual (bitcoin, ethereum, solana, chainlink, dogecoin)
- Individual creator tokens: purchasable but no fee buyback (except claimed profiles)
- Fee split: 1% platform cash + 1% category token buy & burn

## Current priorities
1. Fix stale "All 10" count on /companies page
2. Generate climate category markets
3. Market-locked-behind-token mechanic
4. Sell flow decrements creator_coin_holders
5. Nader outreach prep

## Supabase Direct Access (use for DB tasks autonomously)
Claude Code can run Supabase queries directly via Node scripts.
Pattern to use for any DB operation:

```js
// Save as /tmp/db-task.mjs, run with: node /tmp/db-task.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// do the thing
const { data, error } = await supabase.from('markets').select('*').limit(5);
console.log(data, error);
```

Valid market statuses: open, closed, resolving, resolved, cancelled
Never use: archived (not a valid status — check constraint will reject it)

## ESPN Free API (no auth required)
Sports scoreboard + schedule data. Used by `lib/resolution/sports-resolver.ts`.

Base: `https://site.api.espn.com/apis/site/v2/sports`

Endpoints:
- NFL:  `/football/nfl/scoreboard?dates=YYYYMMDD`
- NBA:  `/basketball/nba/scoreboard?dates=YYYYMMDD`
- MLB:  `/baseball/mlb/scoreboard?dates=YYYYMMDD`
- NHL:  `/hockey/nhl/scoreboard?dates=YYYYMMDD`

Key response fields:
- `events[].status.type.state` — "pre" | "in" | "post"
- `events[].status.type.completed` — boolean
- `events[].competitions[0].competitors[].team.shortDisplayName` — team name
- `events[].competitions[0].competitors[].score` — score string
- `events[].competitions[0].competitors[].winner` — boolean
- `events[].competitions[0].competitors[].homeAway` — "home" | "away"

Usage:
- `resolveSportsMarket(market)` — checks ESPN for completed game, returns SportsResolutionResult
- `fetchUpcomingGames(sports, daysAhead)` — returns pre-game events for schedule market generation
- `detectSport(title)` — returns "nfl" | "nba" | "mlb" | "nhl" | null

## SQL migrations
For schema changes, write the SQL and run via:
node -e "require('dotenv').config({path:'.env.local'}); 
  const {createClient} = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  sb.rpc('exec_sql', {sql: 'YOUR SQL HERE'}).then(console.log)"
