-- Auto-generated from database/migrations/076_form_fields_required.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('form_fields_required', '{"account_type":["coverage"]}', 'json', 'requests', 1, 'حقول النماذج الإجبارية')
ON CONFLICT (setting_key) DO NOTHING;
