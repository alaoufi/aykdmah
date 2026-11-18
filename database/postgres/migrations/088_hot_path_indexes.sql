-- Auto-generated from database/migrations/088_hot_path_indexes.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE is_read = 0;
CREATE INDEX IF NOT EXISTS idx_requests_client_created ON requests (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requests_assigned_provider ON requests (assigned_provider_id) WHERE assigned_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_request ON conversations (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_unread ON messages (conversation_id) WHERE is_read = 0 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_offers_request ON offers (request_id);
CREATE INDEX IF NOT EXISTS idx_offers_provider ON offers (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_files_request ON request_files (request_id);
CREATE INDEX IF NOT EXISTS idx_request_files_url ON request_files (file_url);
CREATE INDEX IF NOT EXISTS idx_message_files_url ON message_files (file_url);
CREATE INDEX IF NOT EXISTS idx_users_avatar ON users (avatar) WHERE avatar IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_provider_badges_user ON provider_badges (user_id, badge_type);
