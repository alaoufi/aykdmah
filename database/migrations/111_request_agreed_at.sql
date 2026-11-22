-- AYK-442: when the requester and the service provider agreed («وقت الاتفاق» in «تم مؤخرًا»).
-- updated_at moves on every later change, so the agreement keeps its own time.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMP NULL DEFAULT NULL;
UPDATE requests r SET agreed_at = COALESCE((SELECT o.accepted_at FROM offers o WHERE o.id = r.accepted_offer_id), r.completed_at, r.updated_at)
  WHERE r.agreed_at IS NULL AND r.assigned_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requests_agreed_at ON requests (agreed_at DESC) WHERE agreed_at IS NOT NULL;
