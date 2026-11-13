-- Auto-generated from database/migrations/042_calls.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(64) NOT NULL UNIQUE,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  caller_id INT NOT NULL,
  callee_id INT NOT NULL,
  call_type VARCHAR(10) NOT NULL DEFAULT 'audio',
  status VARCHAR(20) NOT NULL DEFAULT 'ringing',
  end_reason VARCHAR(40) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP NULL DEFAULT NULL,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_calls_callee_status ON calls (callee_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_caller_status ON calls (caller_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls (conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_request ON calls (request_id);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls (created_at);
CREATE TABLE IF NOT EXISTS call_reports (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL,
  reporter_id INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  reviewed_by INT DEFAULT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_reports_unique ON call_reports (call_id, reporter_id);
CREATE INDEX IF NOT EXISTS idx_call_reports_status ON call_reports (status, created_at);
