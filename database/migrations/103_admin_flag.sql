-- AYK-383 (the owner: «إذا دخل الإدارة يكون كله إدارة ولا علاقة له بالموقع، والعكس؛ وإذا رجع للموقع
-- يمارس كمستخدم. ممكن أكون مقدم خدمة ومسؤولًا إداريًا»). The administration's rights are no longer
-- an account type: users.is_admin marks them (with is_super_admin and permissions as before), and
-- users.role is always what the person is on the site: a requester ('client') or a provider.
-- Administration accounts start on the site as requesters; each can become a provider as usual.
-- Rollback: UPDATE users SET role = 'admin' WHERE is_admin = 1; ALTER TABLE users DROP COLUMN is_admin;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin SMALLINT NOT NULL DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE role = 'admin';
UPDATE users SET role = 'client' WHERE role = 'admin';
INSERT INTO user_profiles (user_id) SELECT id FROM users WHERE is_admin = 1 ON CONFLICT (user_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = 1;
