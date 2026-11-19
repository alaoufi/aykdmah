-- -----------------------------------------------------
-- Migration 056: messages to the administration (AYK-046)
--
-- A user writes to the administration under a topic (support, suggestion,
-- administration); each thread keeps the replies of both sides. The unread
-- counters drive the reminders: a number for the user and for the admins.
--
-- Rollback:
--   DROP TABLE IF EXISTS support_messages;
--   DROP TABLE IF EXISTS support_tickets;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  topic VARCHAR(20) NOT NULL DEFAULT 'support',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  user_unread INT NOT NULL DEFAULT 0,
  admin_unread INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, updated_at);

CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender_id INT NULL,
  from_admin SMALLINT NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, id);
