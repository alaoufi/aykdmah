-- Auto-generated from database/migrations/114_request_alerts_off.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS request_alerts_off SMALLINT NOT NULL DEFAULT 0;
