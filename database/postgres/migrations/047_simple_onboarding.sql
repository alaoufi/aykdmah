-- Auto-generated from database/migrations/047_simple_onboarding.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE users ADD COLUMN IF NOT EXISTS also_client SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS coverage_city_id INT DEFAULT NULL;
CREATE TABLE IF NOT EXISTS provider_coverage_districts (
  user_id INT NOT NULL,
  district_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, district_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_provider_coverage_district ON provider_coverage_districts (district_id);
