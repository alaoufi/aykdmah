-- Auto-generated from database/migrations/021_ad_region_targeting.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_regions JSONB DEFAULT NULL;

ALTER TABLE ip_geo_cache ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL;
