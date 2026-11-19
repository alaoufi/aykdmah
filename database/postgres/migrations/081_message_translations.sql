-- Auto-generated from database/migrations/081_message_translations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS message_translations (
  message_id INT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  source_lang VARCHAR(10) NULL,
  translated_text TEXT NOT NULL,
  same_language SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, lang)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_lang VARCHAR(10) NULL;
