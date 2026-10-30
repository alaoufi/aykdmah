-- Auto-generated from database/migrations/062_native_push_tokens.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS native_push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(512) NOT NULL,
  app_version VARCHAR(20) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_native_push_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_push_tokens_token ON native_push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON native_push_tokens (user_id);
