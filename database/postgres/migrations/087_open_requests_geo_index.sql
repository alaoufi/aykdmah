-- Auto-generated from database/migrations/087_open_requests_geo_index.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE INDEX IF NOT EXISTS idx_requests_open_geo ON requests (latitude, longitude)
  WHERE status = 'open' AND deleted_at IS NULL;
