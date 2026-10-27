-- Add specialized administrative permissions once. When upgrading the legacy
-- schema for the first time, existing administrators retain their former access.
-- A missing migration journal must never re-promote current limited admins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users'
      AND column_name = 'is_super_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_super_admin SMALLINT NOT NULL DEFAULT 0;
    UPDATE users SET is_super_admin = 1 WHERE role = 'admin';
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;
