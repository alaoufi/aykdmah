-- Revoke sessions durably after logout or account security changes.
-- Existing accounts retain version zero; no passwords or profiles change.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key VARCHAR(64) PRIMARY KEY,
  total_hits INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset ON auth_rate_limits(reset_at);
