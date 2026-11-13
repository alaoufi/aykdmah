-- -----------------------------------------------------
-- Migration 054: requester's own directory and direct contact (AYK-041)
--
-- * saved_providers: providers a requester keeps in "My directory" to contact
--   again without posting a request.
-- * requests.direct_provider_id: a request opened by contacting one provider
--   from the directory. It counts as a request in the statistics but is not
--   shown to, or announced to, other providers.
--
-- Rollback:
--   DROP TABLE IF EXISTS saved_providers;
--   ALTER TABLE requests DROP COLUMN IF EXISTS direct_provider_id;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_providers (
  user_id INT NOT NULL,
  provider_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider_id),
  CONSTRAINT fk_saved_providers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_providers_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS direct_provider_id INT NULL DEFAULT NULL;
