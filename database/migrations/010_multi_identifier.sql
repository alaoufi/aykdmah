-- -----------------------------------------------------
-- Migration 010: multi-identifier sign-in
-- - Users can sign in with any unique identifier they own:
--     username / phone / email / facebook_id
-- - Each is independently UNIQUE (NULLs allowed so the user can
--   register with just one). The chosen verification methods to
--   activate the account stay separate (verify_methods_enabled
--   setting still gates them).
-- -----------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username    VARCHAR(60)  DEFAULT NULL AFTER full_name,
  ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(120) DEFAULT NULL AFTER username;

-- UNIQUE constraints — added separately so a single duplicate row
-- (e.g. legacy NULL clashes) doesn't roll the entire migration back.
ALTER TABLE users ADD UNIQUE KEY uq_users_username (username);
ALTER TABLE users ADD UNIQUE KEY uq_users_facebook (facebook_id);
