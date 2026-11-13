-- Auto-generated from database/migrations/059_contact_window_warranty.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_days INT NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_proposed_days INT NULL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS warranty_proposed_by INT NULL DEFAULT NULL;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('contact_after_done_days', '7', 'number', 'requests', 1, 'أيام بقاء المحادثة مفتوحة بعد انتهاء الطلب')
ON CONFLICT (setting_key) DO NOTHING;
