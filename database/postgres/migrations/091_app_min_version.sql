-- Auto-generated from database/migrations/091_app_min_version.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_min_version_android', '', 'string', 'general', 1, 'أقل إصدار مسموح لتطبيق الأندرويد (مثل 1.3.8). من عنده أقدم يُطلب منه التحديث من المتجر. اكتبه فقط بعد أن يظهر الإصدار في Google Play للجميع')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_min_version_ios', '', 'string', 'general', 1, 'أقل إصدار مسموح لتطبيق الآيفون. اكتبه فقط بعد أن يظهر الإصدار في App Store للجميع')
ON CONFLICT (setting_key) DO NOTHING;
