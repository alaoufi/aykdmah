-- -----------------------------------------------------
-- Migration 048: provider availability (AYK-029)
--
-- * availability_status: 'active' or 'paused' (stopped until the provider
--   turns it back on).
-- * vacation_from / vacation_to: a scheduled stop, inclusive dates in Saudi
--   time ('YYYY-MM-DD'). Stored as text so no time zone can shift a day.
-- * work_days: CSV of weekday numbers (0 = Sunday .. 6 = Saturday); NULL = every day.
-- * work_from / work_to: 'HH:MM'; NULL = all day. work_to < work_from spans midnight.
--
-- Rollback:
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS availability_status;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS vacation_from;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS vacation_to;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS work_days;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS work_from;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS work_to;
-- -----------------------------------------------------

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS availability_status VARCHAR(10) NOT NULL DEFAULT 'active';
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS vacation_from VARCHAR(10) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS vacation_to VARCHAR(10) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_days VARCHAR(20) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_from VARCHAR(5) DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_to VARCHAR(5) DEFAULT NULL;
