-- Auto-generated from database/migrations/020_ad_geo_targeting.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_countries JSONB DEFAULT NULL;

ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_cities    JSONB DEFAULT NULL;

CREATE TABLE IF NOT EXISTS ip_geo_cache (
  ip          VARCHAR(64)  NOT NULL PRIMARY KEY,
  country     VARCHAR(8)   DEFAULT NULL,
  country_name VARCHAR(80) DEFAULT NULL,
  region      VARCHAR(120) DEFAULT NULL,
  city        VARCHAR(120) DEFAULT NULL,
  latitude    DECIMAL(10,6) DEFAULT NULL,
  longitude   DECIMAL(10,6) DEFAULT NULL,
  provider    VARCHAR(40)  DEFAULT NULL,
  resolved_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_geo_provider', 'ip-api', 'string', 'auth', 0, 'مزود الكشف الجغرافي من IP (ip-api / disabled)'),
('ads_geo_cache_days', '14',  'number', 'auth', 0, 'مدة بقاء نتيجة الكشف الجغرافي في الكاش (أيام)') ON CONFLICT DO NOTHING;
