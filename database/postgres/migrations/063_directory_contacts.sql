-- Auto-generated from database/migrations/063_directory_contacts.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE saved_providers ADD COLUMN IF NOT EXISTS nickname VARCHAR(80) NULL DEFAULT NULL;
