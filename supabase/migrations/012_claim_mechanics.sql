CREATE TABLE IF NOT EXISTS creator_claim_watchers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id),
  user_id uuid references users(id),
  email text,
  notified boolean default false,
  created_at timestamptz default now(),
  UNIQUE(creator_id, user_id)
);

CREATE TABLE IF NOT EXISTS creator_market_responses (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id),
  market_id uuid references markets(id),
  response_text text not null,
  created_at timestamptz default now(),
  UNIQUE(creator_id, market_id)
);

ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_watcher_count integer DEFAULT 0;
