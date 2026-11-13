-- -----------------------------------------------------
-- Migration 064: translation memory and monthly usage (AYK-121)
--
-- Every sentence Microsoft translates is kept, so the same sentence again ("where are
-- you?", "on my way") is answered from our own server at once and costs nothing. The
-- usage table counts the characters sent to the paid translator each month, for the
-- admin meter and the 80% warning.
--
-- Rollback:
--   DROP TABLE IF EXISTS translation_memory;
--   DROP TABLE IF EXISTS translation_usage;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS translation_memory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_hash CHAR(64) NOT NULL,
  target_lang VARCHAR(5) NOT NULL,
  source_lang VARCHAR(10) NULL,
  translated_text TEXT NOT NULL,
  same_language SMALLINT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_translation_memory_text ON translation_memory (source_hash, target_lang);

CREATE TABLE IF NOT EXISTS translation_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month CHAR(7) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  chars INT NOT NULL DEFAULT 0,
  requests INT NOT NULL DEFAULT 0,
  alerted SMALLINT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_translation_usage_month ON translation_usage (month, provider);
