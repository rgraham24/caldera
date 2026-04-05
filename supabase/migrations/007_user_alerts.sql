CREATE TABLE IF NOT EXISTS user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  creator_id uuid references creators(id) not null,
  deso_username text not null,
  alert_type text not null check (alert_type in ('above', 'below')),
  target_price_usd numeric not null,
  current_price_at_creation numeric not null,
  is_triggered boolean default false,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

ALTER TABLE creators ADD COLUMN IF NOT EXISTS weekly_volume_usd numeric DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS weekly_volume_updated_at timestamptz;
