CREATE TABLE IF NOT EXISTS coin_holder_distributions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id),
  trade_id uuid references trades(id),
  creator_id uuid references creators(id),
  total_pool_amount numeric not null,
  per_coin_amount numeric not null,
  snapshot_holder_count integer,
  created_at timestamptz default now()
);

DO $$ BEGIN
  ALTER TABLE trades ADD COLUMN coin_holder_pool_amount numeric default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE creators ADD COLUMN total_coins_in_circulation numeric default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE creators ADD COLUMN total_fees_distributed numeric default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN coin_earnings_balance numeric default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
