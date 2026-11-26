-- Auto-generated from database/migrations/120_users_hidden.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
