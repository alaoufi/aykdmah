-- Auto-generated from database/migrations/109_request_share_permission.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE users SET share_phone = 1 WHERE share_phone > 1;
UPDATE users SET share_whatsapp = 1 WHERE share_whatsapp > 1;
UPDATE users SET share_name = 1 WHERE share_name > 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_request_share SMALLINT NOT NULL DEFAULT 0;
