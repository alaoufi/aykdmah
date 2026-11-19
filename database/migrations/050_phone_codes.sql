-- -----------------------------------------------------
-- Migration 050: phone codes before an account exists (AYK-016)
--
-- Sign-up and "forgot password" send a code to a phone number that has no
-- signed-in session yet. Only an HMAC of the code is stored.
--
-- Rollback:
--   DROP TABLE IF EXISTS phone_codes;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS phone_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(10) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_phone_codes_lookup ON phone_codes (phone, purpose, created_at);
