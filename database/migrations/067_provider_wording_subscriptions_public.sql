-- -----------------------------------------------------
-- Migration 067 (AYK-147): "service provider", never "worker"; subscriptions shown only when on
--
-- 1. The plan the owner named "اشتراك العامل" becomes "اشتراك مقدم الخدمة" (and in English
--    "Service provider subscription"): the person is not necessarily a worker.
-- 2. The subscriptions switch (`subscriptions_enabled`, set from the administration) becomes a
--    public setting, so the site hides every subscription page and link while it is off.
--
-- Rollback:
--   UPDATE subscription_plans SET name_ar = 'اشتراك العامل', name_en = 'Worker subscription',
--     description = 'اشتراك العامل الشهري في أي خدمة' WHERE id = 2;
--   UPDATE settings SET is_public = 0 WHERE setting_key = 'subscriptions_enabled';
-- -----------------------------------------------------

UPDATE subscription_plans SET name_ar = REPLACE(name_ar, 'اشتراك العامل', 'اشتراك مقدم الخدمة')
  WHERE name_ar LIKE '%العامل%';
UPDATE subscription_plans SET name_en = REPLACE(name_en, 'Worker subscription', 'Service provider subscription')
  WHERE name_en LIKE '%Worker%';
UPDATE subscription_plans SET description = REPLACE(description, 'اشتراك العامل', 'اشتراك مقدم الخدمة')
  WHERE description LIKE '%العامل%';
UPDATE settings SET is_public = 1 WHERE setting_key = 'subscriptions_enabled';
