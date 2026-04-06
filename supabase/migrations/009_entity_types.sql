ALTER TABLE creators ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'individual';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS sport text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS league text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS conference text;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS secondary_creator_id uuid REFERENCES creators(id);
