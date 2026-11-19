-- Auto-generated from database/migrations/079_form_fields_top.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('form_fields_top', '{"request":["details"]}', 'json', 'requests', 1, 'حقول النماذج المعروضة مع النشر الأول')
ON CONFLICT (setting_key) DO NOTHING;
