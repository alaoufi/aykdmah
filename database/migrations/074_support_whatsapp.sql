-- AYK-212: complaints and technical support also by WhatsApp. The number shows on the support page
-- and is edited in the admin settings (general tab). Adds one public setting; existing values stay.
-- Rollback: deploy the preceding application code; the setting is then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('support_whatsapp', '0500785596', 'string', 'general', 1, 'رقم واتساب الدعم الفني والشكاوى')
ON CONFLICT (setting_key) DO NOTHING;
