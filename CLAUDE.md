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
