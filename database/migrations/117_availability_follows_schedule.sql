-- AYK-483 (the owner, seeing a provider with a 24-hour schedule shown «غير متاح للعمل» because no notice
-- channel was registered: «المفروض متاح للعمل متوافقة مع جدول العمل بدقة»): «متاح للعمل» follows the work
-- schedule exactly. The switch «اشتراط وصول التنبيهات للجوال» stays in the administration but is OFF.
UPDATE settings SET setting_value = 'false' WHERE setting_key = 'availability_needs_alerts';
