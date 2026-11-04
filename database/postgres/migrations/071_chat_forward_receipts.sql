-- Auto-generated from database/migrations/071_chat_forward_receipts.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS chat_forward_receipts (
  sender_id INT NOT NULL,
  operation_id VARCHAR(36) NOT NULL,
  target_conversation_id INT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  message_ids JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sender_id, operation_id, target_conversation_id),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
