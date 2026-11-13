-- Auto-generated from database/migrations/007_provider_location_mode.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS location_mode TEXT CHECK (location_mode IN ('fixed','mobile')) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS fixed_latitude  DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_address   VARCHAR(255)  DEFAULT NULL;

UPDATE provider_profiles pp
SET fixed_latitude = u.latitude, fixed_longitude = u.longitude
FROM users u
WHERE pp.user_id = u.id AND pp.fixed_latitude IS NULL AND u.latitude IS NOT NULL;
