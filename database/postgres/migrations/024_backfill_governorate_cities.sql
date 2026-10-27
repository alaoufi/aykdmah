-- Auto-generated from database/migrations/024_backfill_governorate_cities.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

INSERT INTO cities (governorate_id, name_ar, name_en,
                    latitude, longitude, is_active, sort_order)
SELECT g.id, g.name_ar, g.name_en,
       g.latitude, g.longitude, 1, COALESCE(g.sort_order, 0)
FROM governorates g
WHERE NOT EXISTS (
  SELECT 1 FROM cities c WHERE c.governorate_id = g.id
);
