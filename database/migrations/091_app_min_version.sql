-- AYK-287: the lowest app version allowed to open the site, per store. An app older than this
-- (it says its version as it opens the site) is stopped by a full screen with one button to its
-- store page, so a store update reaches everyone at once, Google Play 1.2.5 included. Empty means
-- no minimum. Set it only once the version is published in the store for everyone.
-- Rollback: deploy the preceding application code; the settings are then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_min_version_android', '', 'string', 'general', 1, 'أقل إصدار مسموح لتطبيق الأندرويد (مثل 1.3.8). من عنده أقدم يُطلب منه التحديث من المتجر. اكتبه فقط بعد أن يظهر الإصدار في Google Play للجميع')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_min_version_ios', '', 'string', 'general', 1, 'أقل إصدار مسموح لتطبيق الآيفون. اكتبه فقط بعد أن يظهر الإصدار في App Store للجميع')
ON CONFLICT (setting_key) DO NOTHING;
