-- -----------------------------------------------------
-- Migration 044: open the whole Kingdom
-- The launch defaults (030) limited the platform to Al-Qassim and Al Majmaah.
-- Activate every Saudi region with its governorates, cities and districts.
--
-- Rollback: re-run the region/governorate/city/district UPDATEs of 030.
-- -----------------------------------------------------

UPDATE regions SET is_active = 1
  WHERE country_id = (SELECT id FROM countries WHERE code = 'SA');
UPDATE governorates SET is_active = 1
  WHERE region_id IN (SELECT id FROM regions WHERE country_id = (SELECT id FROM countries WHERE code = 'SA'));
UPDATE cities SET is_active = 1
  WHERE region_id IN (SELECT id FROM regions WHERE country_id = (SELECT id FROM countries WHERE code = 'SA'))
     OR governorate_id IN (SELECT id FROM governorates WHERE is_active = 1);
UPDATE districts SET is_active = 1
  WHERE city_id IN (SELECT id FROM cities WHERE is_active = 1);
UPDATE settings SET setting_value = 'خدمات المنزل في جميع مناطق المملكة'
  WHERE setting_key = 'site_description' AND setting_value = 'خدمات المنزل في القصيم والمجمعة';
