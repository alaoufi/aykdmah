-- Auto-generated from database/migrations/057_call_diagnostics.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS call_diagnostics (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL,
  user_id INT NOT NULL,
  connection_type VARCHAR(20) NULL,
  rtt_ms INT NULL,
  jitter_ms INT NULL,
  packet_loss_pct DECIMAL(5,2) NULL,
  audio_kb_in INT NULL,
  audio_kb_out INT NULL,
  video_kb_in INT NULL,
  poor_seconds INT NOT NULL DEFAULT 0,
  reconnects INT NOT NULL DEFAULT 0,
  audio_blocked SMALLINT NOT NULL DEFAULT 0,
  network_type VARCHAR(20) NULL,
  device VARCHAR(160) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_call_diagnostics_call FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE,
  CONSTRAINT fk_call_diagnostics_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_diagnostics_call_user ON call_diagnostics (call_id, user_id);
CREATE INDEX IF NOT EXISTS idx_call_diagnostics_created ON call_diagnostics (created_at);
