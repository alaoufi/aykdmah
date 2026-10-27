-- Durable uploads for serverless deployments. URLs contain random UUIDs.
-- Private scopes require owner/participant authorization; attached active avatars
-- and visible review images may be public. There is no public listing API.
CREATE TABLE IF NOT EXISTS uploaded_media (
  id UUID PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('requests','chat','reviews','avatars','disputes')),
  scope_id BIGINT DEFAULT NULL,
  filename VARCHAR(200) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL CHECK (size > 0 AND size <= 4194304),
  data BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (octet_length(data) = size)
);
CREATE INDEX IF NOT EXISTS uploaded_media_owner_idx ON uploaded_media(owner_id);
CREATE INDEX IF NOT EXISTS uploaded_media_scope_idx ON uploaded_media(scope, scope_id);
