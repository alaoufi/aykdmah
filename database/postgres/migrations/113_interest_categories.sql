-- Auto-generated from database/migrations/113_interest_categories.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS interest_category_ids TEXT NULL DEFAULT NULL;
