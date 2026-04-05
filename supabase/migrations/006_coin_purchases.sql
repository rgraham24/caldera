CREATE TABLE IF NOT EXISTS user_coin_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  creator_id uuid references creators(id),
  deso_username text,
  coins_purchased numeric not null,
  price_per_coin_usd numeric not null,
  deso_price_at_purchase numeric not null,
  tx_hash text,
  purchased_at timestamptz default now()
);
