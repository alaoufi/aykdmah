-- Auto-generated from database/migrations/093_provider_public_contact.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS show_phone SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS show_whatsapp SMALLINT NOT NULL DEFAULT 0;
