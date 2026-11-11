-- Auto-generated from database/migrations/072_login_lockout.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_at TIMESTAMP NULL;
