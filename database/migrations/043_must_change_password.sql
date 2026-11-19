-- -----------------------------------------------------
-- Migration 043: force a password change on first login
-- Set for accounts created with a generated password (the bootstrap
-- administrator). Cleared when the user changes their password.
--
-- Rollback:
--   ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;
-- -----------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
