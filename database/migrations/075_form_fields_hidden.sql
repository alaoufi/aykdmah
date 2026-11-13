-- AYK-215: the owner shows or hides optional fields of the «طلب خدمة» form from the admin area
-- («حقول النماذج»). JSON: { "request": ["title", "voice", …] } lists the hidden fields; empty shows all.
-- Rollback: deploy the preceding application code; the setting is then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('form_fields_hidden', '{}', 'json', 'requests', 1, 'حقول النماذج المخفية')
ON CONFLICT (setting_key) DO NOTHING;
