-- Auto-generated from database/migrations/065_message_delivered.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP NULL DEFAULT NULL;
