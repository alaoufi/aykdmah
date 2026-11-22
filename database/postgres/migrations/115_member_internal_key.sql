-- Auto-generated from database/migrations/115_member_internal_key.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS internal_key VARCHAR(6) NULL;
CREATE OR REPLACE FUNCTION ayk_new_internal_key() RETURNS VARCHAR AS $$
DECLARE candidate VARCHAR(6);
BEGIN
  LOOP
    candidate := lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE internal_key = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ayk_set_internal_key() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_key IS NULL THEN NEW.internal_key := ayk_new_internal_key(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_users_internal_key ON users;
CREATE TRIGGER trg_users_internal_key BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION ayk_set_internal_key();
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM users WHERE internal_key IS NULL ORDER BY id LOOP
    UPDATE users SET internal_key = ayk_new_internal_key() WHERE id = r.id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_internal_key ON users (internal_key);
UPDATE users SET full_name = 'عضو ' || referral_code
  WHERE full_name ~ '^مستخدم [0-9]{4}$' AND referral_code IS NOT NULL AND referral_code <> '';
