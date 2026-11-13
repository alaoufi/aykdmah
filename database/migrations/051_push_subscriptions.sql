-- -----------------------------------------------------
-- Migration 051: Web Push subscriptions (AYK-008)
--
-- One row per browser/device that allowed notifications. An incoming call
-- rings that device even when the site is closed. The endpoint belongs to a
-- single signed-in user at a time; signing in on the same device moves it.
--
-- Rollback:
--   DROP TABLE IF EXISTS push_subscriptions;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(700) NOT NULL,
  p256dh VARCHAR(200) NOT NULL,
  auth VARCHAR(100) NOT NULL,
  lang VARCHAR(5) NOT NULL DEFAULT 'ar',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
