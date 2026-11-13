-- -----------------------------------------------------
-- Migration 062: the Android app's own push tokens (AYK-094)
--
-- Firebase Cloud Messaging reaches the app even when it is closed, so an incoming
-- call rings continuously with a full-screen call screen. One row per device token,
-- moved to whoever signs in on that device.
--
-- Rollback:
--   DROP TABLE IF EXISTS native_push_tokens;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS native_push_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(512) NOT NULL,
  app_version VARCHAR(20) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_native_push_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_push_tokens_token ON native_push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON native_push_tokens (user_id);
