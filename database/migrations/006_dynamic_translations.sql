-- -----------------------------------------------------
-- Migration 006: Auto-translated names for categories & services
-- - Admin only enters the Arabic name; the server transliterates a
--   slug and translates the name into every supported language.
-- - name_translations JSON keeps {ar,en,ur,bn,hi,…} together so adding
--   a new language never requires another schema change.
-- - Existing name_ar / name_en columns are preserved for back-compat.
-- - description_translations JSON: same idea for the description field.
-- -----------------------------------------------------

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSON DEFAULT NULL;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS name_translations JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSON DEFAULT NULL;

-- Backfill: existing rows get their current name_ar/name_en in the JSON
UPDATE categories
SET name_translations = JSON_OBJECT('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;

UPDATE services
SET name_translations = JSON_OBJECT('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;
