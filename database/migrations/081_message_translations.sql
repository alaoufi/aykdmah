-- AYK-231: a chat message translated once into a reader's language is saved, so reopening the
-- chat (even after a restart) shows it at once with the messages. ui_lang is the language the
-- user last used the site in: the server translates a new message into it as soon as it is sent.
-- Additive only. Rollback: deploy the preceding code; the table and column are then ignored.
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
