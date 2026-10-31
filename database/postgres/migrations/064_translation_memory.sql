-- Auto-generated from database/migrations/064_translation_memory.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS translation_memory (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  month CHAR(7) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  chars INT NOT NULL DEFAULT 0,
  requests INT NOT NULL DEFAULT 0,
  alerted SMALLINT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_translation_usage_month ON translation_usage (month, provider);
