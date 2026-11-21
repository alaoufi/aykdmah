-- Auto-generated from database/migrations/105_requester_contact.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS share_phone SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_whatsapp SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMP NULL;
