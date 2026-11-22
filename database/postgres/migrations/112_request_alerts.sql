-- Auto-generated from database/migrations/112_request_alerts.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS request_alerts SMALLINT NOT NULL DEFAULT 0;
