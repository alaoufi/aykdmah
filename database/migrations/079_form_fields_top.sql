-- AYK-230: the owner chooses for each optional field of the request form whether it shows above
-- the first «انشر» (with the required fields) or in the second group. JSON: { "request": ["details"] }
-- lists the fields shown at the top; required fields are always at the top. «تفاصيل الطلب» starts
-- at the top for its importance.
-- Rollback: deploy the preceding application code; the setting is then ignored.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('form_fields_top', '{"request":["details"]}', 'json', 'requests', 1, 'حقول النماذج المعروضة مع النشر الأول')
ON CONFLICT (setting_key) DO NOTHING;
