-- -----------------------------------------------------
-- Migration 059: contact after a request ends, and an agreed warranty (AYK-081)
--
-- After a request is completed or cancelled, its two sides can still write for
-- "contact_after_done_days" (a market setting, 7 by default) or for the warranty
-- they agreed on, whichever is longer. One side proposes the days and the other
-- accepts. Afterwards the chat stays readable in the archive.
--
-- Rollback:
--   ALTER TABLE requests DROP COLUMN IF EXISTS warranty_days;
--   ALTER TABLE requests DROP COLUMN IF EXISTS warranty_proposed_days;
--   ALTER TABLE requests DROP COLUMN IF EXISTS warranty_proposed_by;
--   DELETE FROM settings WHERE setting_key = 'contact_after_done_days';
-- -----------------------------------------------------

ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_days INT NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_proposed_days INT NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_proposed_by INT NULL DEFAULT NULL;

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('contact_after_done_days', '7', 'number', 'requests', 1, 'أيام بقاء المحادثة مفتوحة بعد انتهاء الطلب')
ON CONFLICT (setting_key) DO NOTHING;
