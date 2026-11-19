-- Initial AYK launch defaults. The migration journal applies this once,
-- so later administrative changes to coverage and pricing are preserved.
UPDATE settings SET setting_value = 'أي خدمة' WHERE setting_key = 'site_name';
UPDATE settings SET setting_value = 'خدمات المنزل في القصيم والمجمعة' WHERE setting_key = 'site_description';
UPDATE settings SET setting_value = 'ar' WHERE setting_key = 'default_language';
UPDATE settings SET setting_value = '0' WHERE setting_key = 'commission_percent';
UPDATE settings SET setting_value = '26.3260' WHERE setting_key = 'default_lat';
UPDATE settings SET setting_value = '43.9750' WHERE setting_key = 'default_lng';
UPDATE settings SET setting_value = 'username,email,phone' WHERE setting_key = 'auth_methods_enabled';

UPDATE countries SET is_active = CASE WHEN code = 'SA' THEN 1 ELSE 0 END;
UPDATE regions SET is_active = CASE
  WHEN country_id = (SELECT id FROM countries WHERE code = 'SA') AND id IN (1,4) THEN 1 ELSE 0 END;
UPDATE governorates SET is_active = CASE
  WHEN region_id = 4 OR (region_id = 1 AND name_ar = 'المجمعة') THEN 1 ELSE 0 END;
UPDATE cities SET is_active = CASE
  WHEN governorate_id IN (SELECT id FROM governorates WHERE is_active = 1) THEN 1 ELSE 0 END;
UPDATE districts SET is_active = CASE
  WHEN city_id IN (SELECT id FROM cities WHERE is_active = 1) THEN 1 ELSE 0 END;

UPDATE categories SET is_active = CASE WHEN id IN (1,2,3,4,5,6,7,8) THEN 1 ELSE 0 END;
UPDATE services SET is_active = CASE
  WHEN category_id IN (SELECT id FROM categories WHERE is_active = 1) THEN 1 ELSE 0 END;
INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order, is_active)
VALUES (3001, 2, 'غسيل الأحواش', 'Yard cleaning', 'ayk-yard-cleaning', 4, 1)
ON CONFLICT (id) DO NOTHING;

-- Keep the free trial plan while real payment collection is being configured.
UPDATE subscription_plans SET name_ar = 'تجربة مجانية', name_en = 'Free trial',
  description = 'تجربة الخدمة قبل تفعيل تحصيل الاشتراك', is_active = 1
  WHERE id = 1;
UPDATE subscription_plans SET name_ar = 'اشتراك العامل', name_en = 'Worker subscription',
  description = 'اشتراك العامل الشهري في أي خدمة', price = 40, duration_days = 30,
  max_offers_per_month = NULL, is_featured = 0, badge = NULL, search_priority = 0,
  features = '["استقبال الطلبات في منطقتك", "ملف مقدم الخدمة", "عروض أسعار للعملاء"]', is_active = 1
  WHERE id = 2;
UPDATE subscription_plans SET is_active = 0 WHERE id NOT IN (1,2);
