-- Auto-generated from database/migrations/083_search_console.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('google_site_verification', '', 'string', 'general', 0, 'رمز تحقق Google Search Console'),
       ('bing_site_verification', '', 'string', 'general', 0, 'رمز تحقق Bing Webmaster Tools')
ON CONFLICT (setting_key) DO NOTHING;
