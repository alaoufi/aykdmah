-- -----------------------------------------------------
-- Migration 047: simplified onboarding (AYK-027)
--
-- * users.also_client: a provider account that also requests other services
--   (the "both" choice at sign-up). Providers never offer on their own request.
-- * provider_profiles.coverage_city_id + provider_coverage_districts: the
--   neighbourhoods of ONE city a provider serves. No rows = the whole city.
--
-- Rollback:
--   DROP TABLE IF EXISTS provider_coverage_districts;
--   ALTER TABLE provider_profiles DROP COLUMN IF EXISTS coverage_city_id;
--   ALTER TABLE users DROP COLUMN IF EXISTS also_client;
-- -----------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS also_client TINYINT(1) NOT NULL DEFAULT 0;
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
