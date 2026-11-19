-- Auto-generated from database/migrations/036_security_integrity.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

DO $$
DECLARE rule RECORD;
BEGIN
  FOR rule IN SELECT * FROM (VALUES
    ('users','users_auth_version_nonnegative','CHECK (auth_version >= 0)'),
    ('users','users_super_admin_boolean','CHECK (is_super_admin IN (0,1))'),
    ('users','users_permissions_array','CHECK (permissions IS NULL OR jsonb_typeof(permissions) = ''array'')'),
    ('users','users_country_integrity','FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL'),
    ('users','users_region_integrity','FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL'),
    ('users','users_governorate_integrity','FOREIGN KEY (governorate_id) REFERENCES governorates(id) ON DELETE SET NULL'),
    ('regions','regions_country_integrity','FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL'),
    ('reviews','reviews_target_integrity','FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL'),
    ('auth_rate_limits','auth_rate_limits_hits_nonnegative','CHECK (total_hits >= 0)'),
    ('verification_otps','verification_otps_attempts_nonnegative','CHECK (attempts >= 0 AND max_attempts > 0)')
  ) AS rules(table_name, constraint_name, definition) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass(format('%I.%I', current_schema(), rule.table_name))
        AND conname = rule.constraint_name
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID',
        rule.table_name, rule.constraint_name, rule.definition);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_region ON users(region_id);

CREATE INDEX IF NOT EXISTS idx_users_governorate ON users(governorate_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_media_created ON uploaded_media(created_at);
