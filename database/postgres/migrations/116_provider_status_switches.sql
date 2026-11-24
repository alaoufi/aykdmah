-- Auto-generated from database/migrations/116_provider_status_switches.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES
  ('presence_visible', 'true', 'boolean', 'requests', 1, 'إظهار «متصل» و«آخر ظهور»'),
  ('availability_visible', 'true', 'boolean', 'requests', 1, 'إظهار «متاح للعمل»'),
  ('availability_needs_alerts', 'true', 'boolean', 'requests', 1, 'اشتراط وصول التنبيهات للجوال ليكون «متاح للعمل»')
ON CONFLICT (setting_key) DO NOTHING;
