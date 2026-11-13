-- Auto-generated from database/migrations/010_multi_identifier.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username    VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(120) DEFAULT NULL;

ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username);

ALTER TABLE users ADD CONSTRAINT uq_users_facebook UNIQUE (facebook_id);
