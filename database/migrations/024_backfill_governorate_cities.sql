-- Backfill: every governorate must have at least one city. The original
-- seed only inserted cities for the biggest 30 governorates, leaving 110+
-- governorates with no cities — so picking those in the admin or in the
-- registration form returned empty lists.
--
-- For every governorate without ANY city, insert one using the
-- governorate's own metadata (name, lat/lng, sort_order). Filtering by
-- region in City.findAll joins through governorates anyway, so we don't
-- need to populate cities.region_id here — the runtime self-heal in
-- server/models/Country.js#backfillGovernorateCities does that.
-- Idempotent: rerunning is a no-op.

SET NAMES utf8mb4;

INSERT INTO cities (governorate_id, name_ar, name_en,
                    latitude, longitude, is_active, sort_order)
SELECT g.id, g.name_ar, g.name_en,
       g.latitude, g.longitude, 1, COALESCE(g.sort_order, 0)
FROM governorates g
WHERE NOT EXISTS (
  SELECT 1 FROM cities c WHERE c.governorate_id = g.id
);
