-- Auto-generated from database/migrations/111_request_agreed_at.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE requests ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMP NULL DEFAULT NULL;
UPDATE requests r SET agreed_at = COALESCE((SELECT o.accepted_at FROM offers o WHERE o.id = r.accepted_offer_id), r.completed_at, r.updated_at)
  WHERE r.agreed_at IS NULL AND r.assigned_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requests_agreed_at ON requests (agreed_at DESC) WHERE agreed_at IS NOT NULL;
