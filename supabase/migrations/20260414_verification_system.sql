-- Part 1: Creator verification and claim system columns
ALTER TABLE creators ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS twitter_handle_verified BOOLEAN DEFAULT false;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified';
-- values: 'unverified' | 'pending_review' | 'approved' | 'rejected'
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_code TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_status TEXT DEFAULT 'unclaimed';
-- values: 'unclaimed' | 'pending_claim' | 'claimed'
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claimed_deso_key TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS unclaimed_earnings_usd NUMERIC DEFAULT 0;

-- Unique constraints (safe even if NULLs exist)
CREATE UNIQUE INDEX IF NOT EXISTS creators_twitter_handle_key ON creators(twitter_handle) WHERE twitter_handle IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS creators_claim_code_key ON creators(claim_code) WHERE claim_code IS NOT NULL;
