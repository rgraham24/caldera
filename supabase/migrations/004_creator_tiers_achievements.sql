-- 1. Creator tiers
ALTER TABLE creators ADD COLUMN IF NOT EXISTS tier text DEFAULT 'unclaimed';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS unclaimed_earnings_escrow numeric DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS total_creator_earnings numeric DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS total_holder_earnings numeric DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS markets_count integer DEFAULT 0;

-- 2. Market subtypes
ALTER TABLE markets ADD COLUMN IF NOT EXISTS market_subtype text DEFAULT 'outcome';

-- 3. User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  achievement_type text not null,
  market_id uuid references markets(id),
  earned_at timestamptz default now(),
  metadata jsonb
);
