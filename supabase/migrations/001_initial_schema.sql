-- Caldera Phase 1 — Initial Schema

create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  deso_public_key text unique,
  wallet_address text,
  is_verified boolean default false,
  is_admin boolean default false,
  reputation_score numeric default 0,
  follower_count_cached integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name text not null,
  slug text unique not null,
  image_url text,
  deso_public_key text,
  is_verified boolean default false,
  creator_coin_symbol text,
  creator_coin_price numeric default 0,
  creator_coin_market_cap numeric default 0,
  creator_coin_holders integer default 0,
  category text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table markets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  category text not null,
  subcategory text,
  creator_id uuid references creators(id),
  created_by_user_id uuid references users(id),
  market_type text default 'binary',
  status text default 'open' check (status in ('open', 'closed', 'resolving', 'resolved', 'cancelled')),
  close_at timestamptz,
  resolve_at timestamptz,
  resolved_at timestamptz,
  resolution_outcome text,
  rules_text text,
  resolution_source_url text,
  featured_score integer default 0,
  trending_score numeric default 0,
  total_volume numeric default 0,
  liquidity numeric default 1000,
  yes_price numeric default 0.5,
  no_price numeric default 0.5,
  yes_pool numeric default 1000,
  no_pool numeric default 1000,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  market_id uuid references markets(id) not null,
  side text not null check (side in ('yes', 'no')),
  quantity numeric default 0,
  avg_entry_price numeric default 0,
  total_cost numeric default 0,
  fees_paid numeric default 0,
  realized_pnl numeric default 0,
  unrealized_pnl_cached numeric default 0,
  status text default 'open' check (status in ('open', 'settled', 'sold')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, market_id, side)
);

create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  market_id uuid references markets(id) not null,
  side text not null check (side in ('yes', 'no')),
  action_type text not null check (action_type in ('buy', 'sell')),
  quantity numeric not null,
  price numeric not null,
  gross_amount numeric not null,
  fee_amount numeric not null,
  platform_fee_amount numeric not null,
  creator_fee_amount numeric default 0,
  market_creator_fee_amount numeric default 0,
  tx_hash text,
  created_at timestamptz default now()
);

create table market_comments (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) not null,
  user_id uuid references users(id) not null,
  body text not null,
  parent_comment_id uuid references market_comments(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  entity_type text not null check (entity_type in ('market', 'creator', 'user')),
  entity_id uuid not null,
  created_at timestamptz default now(),
  unique(user_id, entity_type, entity_id)
);

create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  period text not null check (period in ('alltime', 'monthly', 'weekly')),
  roi_score numeric default 0,
  accuracy_score numeric default 0,
  early_call_score numeric default 0,
  volume_score numeric default 0,
  composite_score numeric default 0,
  rank integer,
  created_at timestamptz default now()
);

create table fee_earnings (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('platform', 'creator', 'market_creator')),
  recipient_id uuid,
  source_type text not null check (source_type in ('trade', 'creator_coin')),
  source_id uuid not null,
  amount numeric not null,
  currency text default 'USD',
  status text default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz default now(),
  paid_at timestamptz
);

create table market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) not null,
  resolved_by_user_id uuid references users(id),
  outcome text not null,
  source_url text,
  notes text,
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table platform_config (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Default fee configuration
insert into platform_config (key, value) values
  ('standard_platform_fee', '0.02'),
  ('user_market_platform_fee', '0.015'),
  ('user_market_creator_fee', '0.005'),
  ('creator_market_platform_fee', '0.015'),
  ('creator_market_creator_fee', '0.01'),
  ('creator_coin_platform_fee', '0.015');
