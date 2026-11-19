-- AYK-227: the app's store pages, shown as badges on the home page (website only, never inside the
-- apps). Google Play is live; the App Store link is filled in from the admin settings once Apple
-- publishes the app (until then its badge reads «قريبًا»). Existing values stay.
-- Rollback: deploy the preceding application code; the settings are then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('google_play_url', 'https://play.google.com/store/apps/details?id=sa.aykdmh.app', 'string', 'general', 1, 'رابط التطبيق في Google Play')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('app_store_url', '', 'string', 'general', 1, 'رابط التطبيق في App Store')
ON CONFLICT (setting_key) DO NOTHING;
