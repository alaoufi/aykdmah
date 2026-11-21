-- Auto-generated from database/migrations/097_special_numbers.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS account_number_aliases (
  code VARCHAR(12) PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_number_aliases_user ON account_number_aliases (user_id);
WITH pool AS (
  SELECT n::text AS code, row_number() OVER (ORDER BY length(n::text), random()) AS rn
    FROM generate_series(10, 99999) AS n
   WHERE n::text !~ '^(\d)\1+$'
     AND NOT EXISTS (SELECT 1 FROM users x WHERE x.referral_code = n::text OR x.legacy_referral_code = n::text)
), pending AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM users WHERE referral_code ~ '^(\d)\1+$'
)
UPDATE users u SET referral_code = p.code
  FROM pending t JOIN pool p ON p.rn = t.rn
 WHERE u.id = t.id;
INSERT INTO account_number_aliases (code, user_id)
SELECT referral_code, id FROM users
 WHERE referral_code = '54' AND role = 'admin' AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = '22')
ON CONFLICT (code) DO NOTHING;
UPDATE users SET referral_code = '22'
 WHERE referral_code = '54' AND role = 'admin' AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = '22');
