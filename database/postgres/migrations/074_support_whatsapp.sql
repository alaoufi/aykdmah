-- Auto-generated from database/migrations/074_support_whatsapp.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('support_whatsapp', '0500785596', 'string', 'general', 1, 'رقم واتساب الدعم الفني والشكاوى')
ON CONFLICT (setting_key) DO NOTHING;
