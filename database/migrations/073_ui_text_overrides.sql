-- AYK-210: the owner edits any interface text from the admin area. One row per language and
-- translation key replaces the built-in text; deleting the row restores it. Additive table only.
-- Rollback: deploy the preceding application code; the table is then ignored.
CREATE TABLE IF NOT EXISTS ui_text_overrides (
  lang VARCHAR(10) NOT NULL,
  text_key VARCHAR(200) NOT NULL,
  text_value TEXT NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lang, text_key)
);
