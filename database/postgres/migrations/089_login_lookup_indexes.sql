-- Auto-generated from database/migrations/089_login_lookup_indexes.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone_plain ON users (REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_facebook ON users (facebook_id) WHERE facebook_id IS NOT NULL;
