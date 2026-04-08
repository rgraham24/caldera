create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_deso_key text not null,
  following_slug text not null,
  created_at timestamptz default now(),
  unique(follower_deso_key, following_slug)
);

create index if not exists follows_follower_idx on follows(follower_deso_key);
create index if not exists follows_following_idx on follows(following_slug);
