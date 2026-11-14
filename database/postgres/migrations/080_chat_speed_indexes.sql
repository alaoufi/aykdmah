-- Auto-generated from database/migrations/080_chat_speed_indexes.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE INDEX IF NOT EXISTS idx_message_files_message ON message_files (message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id, sender_id) WHERE is_read = 0 AND deleted_at IS NULL;
