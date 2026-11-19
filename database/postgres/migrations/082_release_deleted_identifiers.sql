-- Auto-generated from database/migrations/082_release_deleted_identifiers.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE users SET username = NULL, email = NULL, phone = NULL, facebook_id = NULL
WHERE deleted_at IS NOT NULL
  AND (username IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR facebook_id IS NOT NULL);
