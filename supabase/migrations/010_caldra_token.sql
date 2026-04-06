CREATE TABLE IF NOT EXISTS caldra_token (
  id uuid primary key default gen_random_uuid(),
  total_supply_nanos bigint default 0,
  reserve_balance_usd numeric default 0,
  price_usd numeric default 0.01,
  price_change_24h numeric default 0,
  holder_count integer default 0,
  total_volume_usd numeric default 0,
  total_distributed_usd numeric default 0,
  created_at timestamptz default now()
);

INSERT INTO caldra_token (price_usd) 
SELECT 0.01 WHERE NOT EXISTS (SELECT 1 FROM caldra_token);

CREATE TABLE IF NOT EXISTS caldra_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  balance_nanos bigint default 0,
  avg_purchase_price_usd numeric default 0,
  total_invested_usd numeric default 0,
  total_earned_usd numeric default 0,
  is_founding_holder boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS caldra_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  operation text not null check (operation in ('buy', 'sell')),
  usd_amount numeric not null,
  token_amount_nanos bigint not null,
  price_usd_at_trade numeric not null,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS community_pool (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric not null,
  market_id uuid references markets(id),
  trade_id uuid,
  week_of date not null default date_trunc('week', now()),
  created_at timestamptz default now()
);
