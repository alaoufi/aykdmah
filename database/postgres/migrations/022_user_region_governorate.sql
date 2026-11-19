-- Auto-generated from database/migrations/022_user_region_governorate.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE users ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS governorate_id INT DEFAULT NULL;
