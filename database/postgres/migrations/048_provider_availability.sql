-- Auto-generated from database/migrations/048_provider_availability.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS availability_status VARCHAR(10) NOT NULL DEFAULT 'active';
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS vacation_from VARCHAR(10) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS vacation_to VARCHAR(10) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_days VARCHAR(20) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_from VARCHAR(5) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_to VARCHAR(5) DEFAULT NULL;
