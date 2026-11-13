-- -----------------------------------------------------
-- Migration 060: members block each other (AYK-084)
--
-- Either side of a chat may block the other: no messages, calls or new contact
-- between them, the history stays readable. A block neither starts nor applies
-- while a request is assigned between them or within its review and warranty days.
--
-- Rollback:
--   DROP TABLE IF EXISTS user_blocks;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS user_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_pair ON user_blocks (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);
