-- Auto-generated from database/migrations/077_store_links.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('google_play_url', 'https://play.google.com/store/apps/details?id=sa.aykdmh.app', 'string', 'general', 1, 'رابط التطبيق في Google Play')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_store_url', '', 'string', 'general', 1, 'رابط التطبيق في App Store')
ON CONFLICT (setting_key) DO NOTHING;
