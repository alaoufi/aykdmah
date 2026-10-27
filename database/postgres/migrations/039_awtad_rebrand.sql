-- Auto-generated from database/migrations/039_awtad_rebrand.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

UPDATE settings
SET setting_value = 'خدمات أوتاد'
WHERE setting_key = 'site_name' AND setting_value IN ('RIZA', 'RYZA');

UPDATE subscription_plans
SET description = 'اشتراك العامل الشهري في خدمات أوتاد'
WHERE id = 2 AND description IN ('اشتراك العامل الشهري في RIZA', 'اشتراك العامل الشهري في RYZA');

UPDATE install_lock
SET site_name = 'خدمات أوتاد'
WHERE site_name IN ('RIZA', 'RYZA');
