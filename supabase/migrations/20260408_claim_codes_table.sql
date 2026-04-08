-- Run this in Supabase SQL editor or via: npx supabase db push
CREATE TABLE IF NOT EXISTS claim_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL,
  code text NOT NULL UNIQUE,
  status text DEFAULT 'pending', -- pending, claimed, expired
  claimed_at timestamptz,
  claimed_by_deso_key text,
  social_post_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_codes_slug_idx ON claim_codes(slug);
CREATE INDEX IF NOT EXISTS claim_codes_code_idx ON claim_codes(code);
