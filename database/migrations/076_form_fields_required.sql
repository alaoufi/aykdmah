-- AYK-218: the owner marks optional fields of «حقول النماذج» as required. JSON: { "request": ["title"],
-- "account_type": ["coverage"] } lists the required fields; a hidden field is always optional. The
-- default keeps today's behaviour: coverage districts are required when becoming a provider.
-- Rollback: deploy the preceding application code; the setting is then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('form_fields_required', '{"account_type":["coverage"]}', 'json', 'requests', 1, 'حقول النماذج الإجبارية')
ON CONFLICT (setting_key) DO NOTHING;
