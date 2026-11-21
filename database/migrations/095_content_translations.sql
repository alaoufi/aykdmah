-- AYK-343 (the owner: «أي إضافة في أي مكان مثل إضافة قسم أو رسائل تُترجم مباشرة لكل اللغات»).
-- What the administration adds is translated into the 11 languages and kept with the row:
-- places (countries, regions, governorates, cities, districts), subscription plans and ads.
-- Professions and services already had these columns (migration 006).
-- NULL means «not translated yet»; the places seeded with the site keep their names from the
-- site's own reference list and stay NULL.
-- Additive only. Rollback: drop these columns.
ALTER TABLE countries ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE governorates ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description_translations JSON DEFAULT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS title_translations JSON DEFAULT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS description_translations JSON DEFAULT NULL;
