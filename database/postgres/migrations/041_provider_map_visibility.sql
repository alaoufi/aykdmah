-- Auto-generated from database/migrations/041_provider_map_visibility.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS show_location_on_map SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_provider_profiles_fixed_point ON provider_profiles (fixed_latitude, fixed_longitude);
CREATE INDEX IF NOT EXISTS idx_users_role_city ON users (role, city_id);
