-- Auto-generated from database/migrations/118_notify_while_away.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_while_away SMALLINT NOT NULL DEFAULT 0;
