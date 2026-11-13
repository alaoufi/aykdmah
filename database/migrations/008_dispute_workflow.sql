-- -----------------------------------------------------
-- Migration 008: full dispute workflow
-- - Adds the 'waiting_response', 'escalated', 'rejected' statuses
-- - Tracks every status change in dispute_status_logs
-- - Stores user/admin notes in dispute_messages
-- - Stores file evidence in dispute_evidence
-- - Adds ratings_allowed enum that the review controller checks before
--   accepting any review for a request
-- - Optional `frozen` / `chat_locked` flags so admin can pause the
--   order while investigating
-- -----------------------------------------------------

ALTER TABLE disputes
  MODIFY COLUMN status ENUM('open','under_review','waiting_response','escalated','resolved','rejected','closed')
    DEFAULT 'open';

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS frozen TINYINT(1) DEFAULT 0 AFTER status,
  ADD COLUMN IF NOT EXISTS chat_locked TINYINT(1) DEFAULT 0 AFTER frozen,
  ADD COLUMN IF NOT EXISTS ratings_allowed ENUM('both','client_only','provider_only','none','pending')
    DEFAULT 'pending' AFTER chat_locked,
  ADD COLUMN IF NOT EXISTS priority ENUM('low','normal','high','urgent') DEFAULT 'normal' AFTER ratings_allowed;

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  kind ENUM('image','voice','file','screenshot') DEFAULT 'file',
  caption VARCHAR(300) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_evidence_dispute (dispute_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispute_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  author_id INT NOT NULL,
  author_role ENUM('client','provider','admin') NOT NULL,
  body TEXT NOT NULL,
  is_internal TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_disp_msg (dispute_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispute_status_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  changed_by INT NOT NULL,
  changed_role ENUM('client','provider','admin','system') DEFAULT 'admin',
  note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_disp_status_log (dispute_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
