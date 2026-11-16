-- Auto-generated from database/migrations/085_visitors.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

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
