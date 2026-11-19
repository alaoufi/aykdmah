-- Auto-generated from database/migrations/018_ad_daily_stats.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE TABLE IF NOT EXISTS ad_stats_daily (
  id SERIAL PRIMARY KEY,
  ad_id INT NOT NULL,
  day DATE NOT NULL,
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ad_day UNIQUE (ad_id, day),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);
