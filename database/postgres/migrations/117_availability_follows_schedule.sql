-- Auto-generated from database/migrations/117_availability_follows_schedule.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE settings SET setting_value = 'false' WHERE setting_key = 'availability_needs_alerts';
