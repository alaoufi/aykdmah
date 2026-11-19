-- Auto-generated from database/migrations/066_conversation_favorite.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS is_favorite SMALLINT DEFAULT 0;
