-- AYK-242: server-level security events for the admin security report: failed SSH sign-ins
-- (one row per address and hour, with the count) and addresses banned by fail2ban. Written by
-- the server's export timer (deploy/security-export.py); kept 90 days. Additive table only.
-- Rollback: deploy the preceding application code; the table is then ignored.
CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(20) NOT NULL,
  event VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 1,
  detail VARCHAR(255) NULL,
  first_at TIMESTAMP NOT NULL,
  last_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, event, ip, first_at)
);
CREATE INDEX IF NOT EXISTS idx_security_events_last ON security_events (last_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_time ON activity_logs (action, created_at);
