-- -----------------------------------------------------
-- Migration 022: store region + governorate on user record
--
-- Until now users only carried city_id + district_id, and the region
-- was derived via JOIN through cities → governorates → regions. The
-- register form now collects the full hierarchy (region → governorate
-- → city → district), so we persist the picks the user actually made.
-- They're optional — leaving any level blank is fine.
-- -----------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS governorate_id INT DEFAULT NULL;
