-- AYK-254: signing in looks an account up by username, e-mail or phone, compared in lower case
-- and with the phone's spaces and brackets removed. Without indexes on exactly those forms, every
-- sign-in attempt (attackers' guesses included) read the whole users table. Additive.
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone_plain ON users (REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_facebook ON users (facebook_id) WHERE facebook_id IS NOT NULL;
