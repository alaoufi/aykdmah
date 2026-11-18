-- AYK-251: the providers' board looks for open requests inside a latitude/longitude box around
-- the provider. This small index holds only the open, undeleted requests by position, so the board
-- no longer reads the whole requests table as it grows. Additive; rollback: DROP INDEX.
CREATE INDEX IF NOT EXISTS idx_requests_open_geo ON requests (latitude, longitude)
  WHERE status = 'open' AND deleted_at IS NULL;
