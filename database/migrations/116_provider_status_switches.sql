-- AYK-481 (the owner: «أبي تفعيل/إيقاف متصل وآخر ظهور، تُفعَّل من التحكم، وكذلك متاح للعمل؛ و«متاح للعمل»
-- تكون مفعّلة حسب جدول العمل وأن رسائل التنبيهات تصل جواله مؤكدة»): three switches in the administration.
--  • presence_visible: show «متصل» and «آخر ظهور».
--  • availability_visible: show «متاح للعمل».
--  • availability_needs_alerts: «متاح للعمل» also needs the provider's notices to reach his phone
--    (a web-push or app channel registered and not failed), on top of his work schedule.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES
  ('presence_visible', 'true', 'boolean', 'requests', 1, 'إظهار «متصل» و«آخر ظهور»'),
  ('availability_visible', 'true', 'boolean', 'requests', 1, 'إظهار «متاح للعمل»'),
  ('availability_needs_alerts', 'true', 'boolean', 'requests', 1, 'اشتراط وصول التنبيهات للجوال ليكون «متاح للعمل»')
ON CONFLICT (setting_key) DO NOTHING;
