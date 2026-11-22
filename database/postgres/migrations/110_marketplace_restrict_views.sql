-- Auto-generated from database/migrations/110_marketplace_restrict_views.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketplace_restrict_views', 'false', 'boolean', 'requests', 1, 'تقييد العرض حسب المهنة والمنطقة')
ON CONFLICT (setting_key) DO NOTHING;
