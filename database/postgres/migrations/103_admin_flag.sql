-- Auto-generated from database/migrations/103_admin_flag.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin SMALLINT NOT NULL DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE role = 'admin';
UPDATE users SET role = 'client' WHERE role = 'admin';
INSERT INTO user_profiles (user_id) SELECT id FROM users WHERE is_admin = 1 ON CONFLICT (user_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = 1;
