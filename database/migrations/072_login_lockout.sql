-- AYK-208: lock password sign-in after 5 wrong passwords until the owner resets the password
-- with an SMS code. Additive columns only; existing accounts start unlocked with no failures.
-- Rollback: deploy the preceding application code; the columns are then ignored.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_at TIMESTAMP NULL;
