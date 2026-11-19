-- Auto-generated from database/migrations/015_ad_media_storage.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE TABLE IF NOT EXISTS ad_media (
  id SERIAL PRIMARY KEY,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL,
  filename VARCHAR(200) DEFAULT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
