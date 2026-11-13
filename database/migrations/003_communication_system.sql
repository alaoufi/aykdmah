-- -----------------------------------------------------
-- Migration 003: Uber-style communication & live tracking
-- Adds:
--   • messages.latitude/longitude/accuracy_m for inline location messages
--   • location_shares: live location ticks for an order/conversation
--   • disputes: opens a controlled admin access window for a conversation
--   • dispute_access_logs: every admin access is logged with reason
--   • conversation_archives: weekly archive snapshots + retention metadata
-- Safe to re-run on previously migrated DBs.
-- -----------------------------------------------------

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL AFTER message_type,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL AFTER latitude,
  ADD COLUMN IF NOT EXISTS accuracy_m INT DEFAULT NULL AFTER longitude;

ALTER TABLE messages
  MODIFY COLUMN message_type ENUM('text','image','file','voice','location','system') DEFAULT 'text';

CREATE TABLE IF NOT EXISTS location_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sender_role ENUM('client','provider','admin') NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m INT DEFAULT NULL,
  heading DECIMAL(5,2) DEFAULT NULL,
  speed_kmh DECIMAL(5,2) DEFAULT NULL,
  is_live TINYINT(1) DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_loc_conv_user (conversation_id, user_id, created_at),
  INDEX idx_loc_request (request_id, created_at),
  INDEX idx_loc_user_live (user_id, is_live, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS disputes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT DEFAULT NULL,
  conversation_id INT DEFAULT NULL,
  opened_by INT NOT NULL,
  assigned_admin_id INT DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status ENUM('open','under_review','resolved','closed') DEFAULT 'open',
  resolution TEXT DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_disputes_status (status),
  INDEX idx_disputes_request (request_id),
  INDEX idx_disputes_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispute_access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  admin_id INT NOT NULL,
  conversation_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_dispute_logs_dispute (dispute_id, opened_at),
  INDEX idx_dispute_logs_admin (admin_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP NULL DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  payload LONGTEXT DEFAULT NULL,
  status ENUM('active','expired','restored','deleted') DEFAULT 'active',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_archives_conv (conversation_id),
  INDEX idx_archives_expires (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Defaults for retention policy
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('chat_archive_retention_days', '90', 'number', 'general', 0, 'مدة الاحتفاظ بأرشيف المحادثات بالأيام'),
('chat_archive_after_days',     '14', 'number', 'general', 0, 'بعد كم يوم من اكتمال الطلب يتم أرشفة المحادثة تلقائياً'),
('location_share_ttl_minutes',  '30', 'number', 'general', 0, 'مدة صلاحية مشاركة الموقع المباشرة بالدقائق'),
('chat_lock_after_completion',  'true', 'boolean', 'general', 0, 'قفل المحادثة بعد اكتمال الطلب');
