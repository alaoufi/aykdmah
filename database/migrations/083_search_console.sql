-- AYK-239: ownership codes for Google Search Console and Bing Webmaster Tools, entered by the owner
-- in the admin settings; the search pages then carry the matching meta tags. Empty until set.
-- Rollback: deploy the preceding application code; the settings are then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('google_site_verification', '', 'string', 'general', 0, 'رمز تحقق Google Search Console'),
       ('bing_site_verification', '', 'string', 'general', 0, 'رمز تحقق Bing Webmaster Tools')
ON CONFLICT (setting_key) DO NOTHING;
