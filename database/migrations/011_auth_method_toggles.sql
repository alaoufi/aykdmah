-- -----------------------------------------------------
-- Migration 011: admin-controlled sign-in & verification toggles
--
-- Sign-in (identifier) methods: which fields the register/profile
-- forms expose to the user. The user still needs to pick at least one.
--   Default: every method enabled (trial mode).
--
-- Verification methods: already tracked by verify_methods_enabled,
-- this migration just refreshes its description to include the new
-- 'facebook' option and keeps the existing CSV value untouched.
-- -----------------------------------------------------

INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('auth_methods_enabled', 'username,email,phone,facebook', 'string', 'auth', 1,
 'طرق التسجيل/الدخول المسموحة (username,email,phone,facebook)');

-- Refresh description only (do not overwrite the admin-chosen value).
UPDATE settings
   SET description = 'طرق التحقق المتاحة (sms,whatsapp,email,nafath,facebook)'
 WHERE setting_key = 'verify_methods_enabled';
