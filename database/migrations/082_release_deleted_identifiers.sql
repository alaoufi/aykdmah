-- AYK-238: accounts deleted from the admin area kept their username, email, phone and Facebook id,
-- so no new account could use them (the owner could not recreate a deleted review account).
-- Deleted accounts stay deleted; only these sign-in fields are cleared, as a user's own deletion
-- already does. Approved by the owner on 2026-11-15. The release script backs the database up first.
-- Rollback: restore from the pre-release dump (the cleared values are not kept elsewhere).
UPDATE users SET username = NULL, email = NULL, phone = NULL, facebook_id = NULL
WHERE deleted_at IS NOT NULL
  AND (username IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR facebook_id IS NOT NULL);
