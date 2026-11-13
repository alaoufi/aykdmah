-- Auto-generated from database/migrations/014_ads_media_type.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image','video')) NOT NULL DEFAULT 'image';
