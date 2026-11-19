-- Auto-generated from database/migrations/003_communication_system.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accuracy_m INT DEFAULT NULL;

SELECT 1;

CREATE TABLE IF NOT EXISTS location_shares (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('client','provider','admin')) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m INT DEFAULT NULL,
  heading DECIMAL(5,2) DEFAULT NULL,
  speed_kmh DECIMAL(5,2) DEFAULT NULL,
  is_live SMALLINT DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS disputes (
  id SERIAL PRIMARY KEY,
  request_id INT DEFAULT NULL,
  conversation_id INT DEFAULT NULL,
  opened_by INT NOT NULL,
  assigned_admin_id INT DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('open','under_review','resolved','closed')) DEFAULT 'open',
  resolution TEXT DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dispute_access_logs (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  admin_id INT NOT NULL,
  conversation_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP NULL DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  payload TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('active','expired','restored','deleted')) DEFAULT 'active',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('chat_archive_retention_days', '90', 'number', 'general', 0, 'مدة الاحتفاظ بأرشيف المحادثات بالأيام'),
('chat_archive_after_days',     '14', 'number', 'general', 0, 'بعد كم يوم من اكتمال الطلب يتم أرشفة المحادثة تلقائياً'),
('location_share_ttl_minutes',  '30', 'number', 'general', 0, 'مدة صلاحية مشاركة الموقع المباشرة بالدقائق'),
('chat_lock_after_completion',  'true', 'boolean', 'general', 0, 'قفل المحادثة بعد اكتمال الطلب') ON CONFLICT DO NOTHING;
