-- -----------------------------------------------------
-- Migration 041: provider map visibility
-- A provider's exact fixed point appears on the public map only after the
-- provider opts in. Everyone else is placed at their city's center, and
-- distances are measured from that center so the real point cannot be inferred.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_provider_profiles_fixed_point;
--   DROP INDEX IF EXISTS idx_users_role_city;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS show_location_on_map;
-- -----------------------------------------------------

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS show_location_on_map TINYINT(1) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_provider_profiles_fixed_point ON provider_profiles (fixed_latitude, fixed_longitude);
CREATE INDEX IF NOT EXISTS idx_users_role_city ON users (role, city_id);
