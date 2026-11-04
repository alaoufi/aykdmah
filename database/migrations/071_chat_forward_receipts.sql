-- AYK-182: bounded, durable forwarding receipts. No existing data is changed.
-- Rollback: deploy the preceding application code; retain this table so retries
-- cannot duplicate previously delivered messages. Do not delete receipts while
-- the idempotent forwarding endpoint is in use.
CREATE TABLE IF NOT EXISTS chat_forward_receipts (
  sender_id INT NOT NULL,
  operation_id VARCHAR(36) NOT NULL,
  target_conversation_id INT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  message_ids JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sender_id, operation_id, target_conversation_id),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
