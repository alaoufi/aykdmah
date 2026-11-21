-- Auto-generated from database/migrations/100_work_schedule.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT NULL;
