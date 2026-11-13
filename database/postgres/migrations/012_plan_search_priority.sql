-- Auto-generated from database/migrations/012_plan_search_priority.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS search_priority INT NOT NULL DEFAULT 0;
