-- Auto-generated from database/migrations/073_ui_text_overrides.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS ui_text_overrides (
  lang VARCHAR(10) NOT NULL,
  text_key VARCHAR(200) NOT NULL,
  text_value TEXT NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lang, text_key)
);
