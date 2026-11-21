-- Auto-generated from database/migrations/096_numeric_account_numbers.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

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
