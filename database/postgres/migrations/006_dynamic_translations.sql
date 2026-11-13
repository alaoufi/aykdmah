-- Auto-generated from database/migrations/006_dynamic_translations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL;

UPDATE categories
SET name_translations = jsonb_build_object('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;

UPDATE services
SET name_translations = jsonb_build_object('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;
