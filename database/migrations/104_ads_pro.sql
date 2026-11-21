-- AYK-409 (the owner: «ابنِ كل الميزات الاحترافية» for ads management, after comparing with the
-- professional ad servers). Additive only:
--  * campaigns that group an advertiser's ads under one period, total views and daily views;
--  * per ad: priority (1 high, 2 normal, 3 fallback) and weight (rotation share), a daily view cap,
--    a per-visitor daily cap (frequency), even pacing over its period, a weekly schedule
--    {"days":[0-6], "from":"HH:MM", "to":"HH:MM"} in Saudi time, and targeting by device
--    ["mobile","desktop"], language ["ar",...] and audience ["guest","client","provider"].
-- Rollback: ALTER TABLE ads DROP COLUMN campaign_id, priority, weight, freq_cap_per_day, daily_max_views,
-- pacing, schedule, target_devices, target_langs, target_audience; DROP TABLE ad_campaigns;
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  advertiser VARCHAR(150),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMP NULL,
  ends_at TIMESTAMP NULL,
  max_views INTEGER NULL,
  daily_max_views INTEGER NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS campaign_id INTEGER NULL REFERENCES ad_campaigns(id) ON DELETE SET NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS weight SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS freq_cap_per_day INTEGER NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS daily_max_views INTEGER NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS pacing VARCHAR(10) NOT NULL DEFAULT 'asap';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS schedule JSONB NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_devices JSONB NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_langs JSONB NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_audience JSONB NULL;
CREATE INDEX IF NOT EXISTS idx_ads_campaign ON ads (campaign_id);
