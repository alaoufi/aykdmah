-- Auto-generated from database/migrations/001_add_offer_geolocation.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(10,2) DEFAULT NULL;
