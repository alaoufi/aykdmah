-- Auto-generated from database/migrations/099_admin_hide.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE requests ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
