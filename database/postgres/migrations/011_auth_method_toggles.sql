-- Auto-generated from database/migrations/011_auth_method_toggles.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('auth_methods_enabled', 'username,email,phone,facebook', 'string', 'auth', 1,
 'طرق التسجيل/الدخول المسموحة (username,email,phone,facebook)') ON CONFLICT DO NOTHING;

UPDATE settings
   SET description = 'طرق التحقق المتاحة (sms,whatsapp,email,nafath,facebook)'
 WHERE setting_key = 'verify_methods_enabled';
