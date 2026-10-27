-- Auto-generated from database/migrations/037_riza_rebrand.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

UPDATE settings
SET setting_value = 'RIZA'
WHERE setting_key = 'site_name' AND setting_value = 'RYZA';

UPDATE subscription_plans
SET description = 'اشتراك العامل الشهري في RIZA'
WHERE id = 2 AND description = 'اشتراك العامل الشهري في RYZA';

UPDATE install_lock
SET site_name = 'RIZA'
WHERE site_name = 'RYZA';
