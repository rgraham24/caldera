ALTER TABLE creators ADD COLUMN IF NOT EXISTS deso_is_reserved boolean DEFAULT false;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS deso_is_verified boolean DEFAULT false;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS token_status text DEFAULT 'shadow';
