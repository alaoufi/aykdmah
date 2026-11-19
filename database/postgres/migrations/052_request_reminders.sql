-- Auto-generated from database/migrations/052_request_reminders.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE requests ADD COLUMN IF NOT EXISTS remind_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS reminders_off SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_requests_remind_at ON requests (remind_at);
