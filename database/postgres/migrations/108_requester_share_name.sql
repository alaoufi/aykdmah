-- Auto-generated from database/migrations/108_requester_share_name.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS share_name SMALLINT NOT NULL DEFAULT 0;
