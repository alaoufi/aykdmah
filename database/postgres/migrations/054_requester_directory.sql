-- Auto-generated from database/migrations/054_requester_directory.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS saved_providers (
  user_id INT NOT NULL,
  provider_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider_id),
  CONSTRAINT fk_saved_providers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_providers_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS direct_provider_id INT NULL DEFAULT NULL;
