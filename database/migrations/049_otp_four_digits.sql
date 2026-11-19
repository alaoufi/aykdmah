-- -----------------------------------------------------
-- Migration 049: four-digit verification codes (owner's choice, AYK-016)
--
-- Changes only the untouched default; an administrator's own value is kept.
-- Guessing stays bounded by verify_otp_max_attempts, the code expiry and the
-- resend wait.
--
-- Rollback:
--   UPDATE settings SET setting_value = '6' WHERE setting_key = 'verify_otp_length' AND setting_value = '4';
-- -----------------------------------------------------

UPDATE settings SET setting_value = '4' WHERE setting_key = 'verify_otp_length' AND setting_value = '6';
