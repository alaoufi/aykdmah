-- -----------------------------------------------------
-- Migration 021: region-level ad targeting
--
-- An ad can now restrict serving to a list of administrative
-- regions (e.g. منطقة الرياض، منطقة مكة المكرمة). Stored as a JSON
-- array of region IDs from the regions table.
--
-- Empty → no region restriction. The country / city axes from
-- migration 020 still apply (any one match wins).
-- -----------------------------------------------------

ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_regions JSON DEFAULT NULL;

-- Cached IP→region resolution. ip-api returns regionName (English)
-- which we map to one of our regions.id rows. Stored alongside the
-- existing geo cache so the lookup is one row, one lifetime.
ALTER TABLE ip_geo_cache ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL;
