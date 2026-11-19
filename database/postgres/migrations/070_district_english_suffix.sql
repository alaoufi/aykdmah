-- Auto-generated from database/migrations/070_district_english_suffix.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS district_name_cleanup_070 (
  district_id BIGINT PRIMARY KEY,
  old_name_en VARCHAR(120) NOT NULL,
  new_name_en VARCHAR(120) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO district_name_cleanup_070 (district_id, old_name_en, new_name_en)
SELECT id, name_en, btrim(REGEXP_REPLACE(name_en, '[[:space:]]+[Dd][Ii][Ss][Tt][.]?[[:space:]]*$', ''))
FROM districts
WHERE name_en ~ '[[:space:]]+[Dd][Ii][Ss][Tt][.]?[[:space:]]*$'
  AND btrim(REGEXP_REPLACE(name_en, '[[:space:]]+[Dd][Ii][Ss][Tt][.]?[[:space:]]*$', '')) <> '' ON CONFLICT (district_id) DO NOTHING;
UPDATE districts AS d SET name_en = b.new_name_en FROM district_name_cleanup_070 b WHERE d.id = b.district_id AND d.name_en = b.old_name_en;
