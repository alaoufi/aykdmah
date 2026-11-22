-- AYK-440 (the owner: «من التحكم تفتح وتغلق حسب السياسة والمسجّلين… إذا مفعّل مقدم الخدمة يرى مهنته في
-- منطقته، وطالب الخدمة يرى مقدمي الخدمة في منطقته وحسب المهن التي طلبها؛ وإذا إيقاف يعرض الكل للكل»).
-- Off at launch, so nobody finds an empty board.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketplace_restrict_views', 'false', 'boolean', 'requests', 1, 'تقييد العرض حسب المهنة والمنطقة')
ON CONFLICT (setting_key) DO NOTHING;
