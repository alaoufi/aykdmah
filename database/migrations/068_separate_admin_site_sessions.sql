-- -----------------------------------------------------
-- Migration 068: separate admin and site sessions (AYK-151)
--
-- The admin area (/admin) and the site or app are two separate sessions, even for the same
-- account: signing out of one never signs out the other. Each has its own version, raised on
-- signing out of it; a password change still raises auth_version and ends both.
--
-- Rollback:
--   ALTER TABLE users DROP COLUMN IF EXISTS site_session_version;
--   ALTER TABLE users DROP COLUMN IF EXISTS admin_session_version;
-- -----------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS site_session_version INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_session_version INT NOT NULL DEFAULT 0;
