ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_code text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_code_expires_at timestamptz;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS claim_attempted_by text;
