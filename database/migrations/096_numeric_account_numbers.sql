-- AYK-353 (the owner: «أرقام فقط بلا حروف، الحروف صعوبة إدخال، وعدّل الحاليين بأرقام»).
-- Every account's number (shown at the top, used to sign in, and the marketing code) becomes digits
-- only: two digits first (10-99), then three, then four, in a random order inside each length.
-- The old code (letters and digits) is kept in legacy_referral_code and still works for signing in
-- and as an invite code, so nothing already shared stops working.
-- Rollback: UPDATE users SET referral_code = legacy_referral_code WHERE legacy_referral_code IS NOT NULL;
--           ALTER TABLE users DROP COLUMN legacy_referral_code;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_referral_code VARCHAR(12) DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_legacy_referral_code ON users (legacy_referral_code);

WITH pool AS (
  SELECT n::text AS code, row_number() OVER (ORDER BY length(n::text), random()) AS rn
    FROM generate_series(10, 99999) AS n
   WHERE NOT EXISTS (SELECT 1 FROM users x WHERE x.referral_code = n::text)
), pending AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
    FROM users
   WHERE referral_code IS NOT NULL AND referral_code !~ '^[0-9]+$'
)
UPDATE users u
   SET legacy_referral_code = u.referral_code, referral_code = p.code
  FROM pending t JOIN pool p ON p.rn = t.rn
 WHERE u.id = t.id;
