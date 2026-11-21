-- Auto-generated from database/migrations/095_content_translations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE countries ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE governorates ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS title_translations JSONB DEFAULT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL;
