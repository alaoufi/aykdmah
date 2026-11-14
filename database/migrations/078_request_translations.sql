-- AYK-229: a request's title and details translated into the language of the provider who opens
-- it, once per language; later visits read the saved translation. Additive table only.
-- Rollback: deploy the preceding application code; the table is then ignored.
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
