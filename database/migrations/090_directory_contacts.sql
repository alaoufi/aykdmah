-- AYK-261 (the owner's decision): "My directory" also keeps contacts the person types in
-- themselves: a name, a mobile number, optionally a different WhatsApp number, and notes.
-- They are the person's own notes: not tied to any account, never copied from one, so they stay
-- whatever happens to the other person's account. Deleting one's own account erases them.
-- Additive only. Rollback: DROP TABLE IF EXISTS directory_contacts;
CREATE TABLE IF NOT EXISTS directory_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  whatsapp VARCHAR(20) NULL DEFAULT NULL,
  notes VARCHAR(1000) NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_directory_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_directory_contacts_user ON directory_contacts (user_id, id);
