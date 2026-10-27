-- -----------------------------------------------------
-- Migration 020: geo-targeting for ads
--
-- An ad can optionally restrict its display to a list of countries
-- and/or cities. Empty → no restriction (serves everywhere).
-- Visitor location is resolved from:
--   1) logged-in user's city_id (if available)
--   2) IP geolocation lookup (cached server-side)
--
-- The two columns are JSON arrays — countries use ISO codes ("SA",
-- "EG", "AE"), cities use names matching the cities table.
-- -----------------------------------------------------

ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_countries JSON DEFAULT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_cities    JSON DEFAULT NULL;

-- Cached IP→location lookups so we don't hammer the free geo API.
CREATE TABLE IF NOT EXISTS ip_geo_cache (
  ip          VARCHAR(64)  NOT NULL PRIMARY KEY,
  country     VARCHAR(8)   DEFAULT NULL,
  country_name VARCHAR(80) DEFAULT NULL,
  region      VARCHAR(120) DEFAULT NULL,
  city        VARCHAR(120) DEFAULT NULL,
  latitude    DECIMAL(10,6) DEFAULT NULL,
  longitude   DECIMAL(10,6) DEFAULT NULL,
  provider    VARCHAR(40)  DEFAULT NULL,
  resolved_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ip_geo_country (country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_geo_provider', 'ip-api', 'string', 'auth', 0, 'مزود الكشف الجغرافي من IP (ip-api / disabled)'),
('ads_geo_cache_days', '14',  'number', 'auth', 0, 'مدة بقاء نتيجة الكشف الجغرافي في الكاش (أيام)');
