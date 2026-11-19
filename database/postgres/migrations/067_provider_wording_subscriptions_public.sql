-- Auto-generated from database/migrations/067_provider_wording_subscriptions_public.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE subscription_plans SET name_ar = REPLACE(name_ar, 'اشتراك العامل', 'اشتراك مقدم الخدمة')
  WHERE name_ar LIKE '%العامل%';
UPDATE subscription_plans SET name_en = REPLACE(name_en, 'Worker subscription', 'Service provider subscription')
  WHERE name_en LIKE '%Worker%';
UPDATE subscription_plans SET description = REPLACE(description, 'اشتراك العامل', 'اشتراك مقدم الخدمة')
  WHERE description LIKE '%العامل%';
UPDATE settings SET is_public = 1 WHERE setting_key = 'subscriptions_enabled';
