-- -----------------------------------------------------
-- Migration 057: call quality log (AYK-060)
--
-- At the end of every answered call each participant's browser reports how
-- the connection behaved, so weak calls can be studied: the path (direct UDP,
-- TCP, or relayed over 443), round trip, packet loss, jitter, the audio and
-- video that actually arrived, seconds of weak internet, reconnects, and
-- whether the browser blocked the other side's audio. Never any media.
--
-- Rollback:
--   DROP TABLE IF EXISTS call_diagnostics;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS call_diagnostics (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
