-- Auto-generated from database/migrations/058_device_reports.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS device_reports (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  device_key VARCHAR(64) NOT NULL,
  os VARCHAR(30) NULL,
  os_version VARCHAR(20) NULL,
  browser VARCHAR(30) NULL,
  browser_version VARCHAR(20) NULL,
  standalone SMALLINT NOT NULL DEFAULT 0,
  push_permission VARCHAR(20) NULL,
  push_subscribed SMALLINT NOT NULL DEFAULT 0,
  push_host VARCHAR(80) NULL,
  mic_permission VARCHAR(20) NULL,
  camera_permission VARCHAR(20) NULL,
  webrtc SMALLINT NOT NULL DEFAULT 0,
  network_type VARCHAR(20) NULL,
  app_version VARCHAR(40) NULL,
  user_agent VARCHAR(255) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_reports_user_device ON device_reports (user_id, device_key);
CREATE INDEX IF NOT EXISTS idx_device_reports_updated ON device_reports (updated_at);
