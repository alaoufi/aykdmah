-- -----------------------------------------------------
-- Migration 052: "Did you find someone?" reminders for open requests
--
-- * remind_at: when the requester is next asked whether the request is still
--   needed (one hour after posting, then once a day while it stays open).
-- * reminders_off: the requester stopped these reminders for this request.
--
-- Rollback:
--   ALTER TABLE requests DROP COLUMN IF EXISTS remind_at;
--   ALTER TABLE requests DROP COLUMN IF EXISTS reminders_off;
-- -----------------------------------------------------

ALTER TABLE requests ADD COLUMN IF NOT EXISTS remind_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS reminders_off SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_requests_remind_at ON requests (remind_at);
