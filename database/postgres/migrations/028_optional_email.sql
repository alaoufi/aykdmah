-- Auto-generated from database/migrations/028_optional_email.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
