DO $$ BEGIN ALTER TABLE creators ADD COLUMN deso_username text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE creators ADD COLUMN profile_pic_url text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE creators ADD COLUMN coin_data_updated_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
