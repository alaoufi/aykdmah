-- Auto-generated from database/migrations/078_request_translations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS request_translations (
  request_id INT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  source_lang VARCHAR(10) NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  provider VARCHAR(30) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id, lang)
);
