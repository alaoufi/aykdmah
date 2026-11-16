-- AYK-244: the site's visitor counter (today, total, online now) and real request view counts.
-- Each visitor is counted once a day (crawlers and a request's own owner are not counted).
-- entity_views only remembers today's and yesterday's visitors (to count each once); visit_days
-- keeps one row per day with the number of visitors. The owner shows or hides the counter and the
-- request views from the admin settings (visitors_public); hidden, admin accounts still see them.
-- Additive only. Rollback: deploy the preceding application code; these are then ignored.
CREATE TABLE IF NOT EXISTS entity_views (
  entity_type VARCHAR(20) NOT NULL,
  entity_id INT NOT NULL,
  viewer_key VARCHAR(64) NOT NULL,
  view_day DATE NOT NULL,
  PRIMARY KEY (entity_type, entity_id, viewer_key, view_day)
);
CREATE INDEX IF NOT EXISTS idx_entity_views_day ON entity_views (view_day);
CREATE TABLE IF NOT EXISTS visit_days (
  day DATE PRIMARY KEY,
  visitors INT NOT NULL DEFAULT 0
);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('visitors_public', 'true', 'boolean', 'general', 1, 'إظهار عداد الزوار والمشاهدات للجميع (عند الإيقاف تظهر للإدارة فقط)')
ON CONFLICT (setting_key) DO NOTHING;
