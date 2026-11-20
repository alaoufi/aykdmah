-- Auto-generated from database/migrations/101_provider_bio_translations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS bio_translations JSONB DEFAULT NULL;
