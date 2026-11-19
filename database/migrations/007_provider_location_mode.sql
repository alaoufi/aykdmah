-- -----------------------------------------------------
-- Migration 007: provider location mode
-- - 'fixed'  : provider works from one address; location is set once
--              when they register and reused for every order
-- - 'mobile' : provider moves between jobs; they share live location
--              per assigned request (see location_shares + tracking)
-- -----------------------------------------------------

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS location_mode ENUM('fixed','mobile') DEFAULT 'fixed' AFTER service_radius_km,
  ADD COLUMN IF NOT EXISTS fixed_latitude  DECIMAL(10,7) DEFAULT NULL AFTER location_mode,
  ADD COLUMN IF NOT EXISTS fixed_longitude DECIMAL(10,7) DEFAULT NULL AFTER fixed_latitude,
  ADD COLUMN IF NOT EXISTS fixed_address   VARCHAR(255)  DEFAULT NULL AFTER fixed_longitude;

-- Backfill: existing rows default to 'fixed' and inherit the user's
-- registration location if the user table has one.
UPDATE provider_profiles pp
SET fixed_latitude = u.latitude, fixed_longitude = u.longitude
FROM users u
WHERE pp.user_id = u.id AND pp.fixed_latitude IS NULL AND u.latitude IS NOT NULL;
