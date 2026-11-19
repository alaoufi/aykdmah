-- AYK-231: indexes for the chat's busiest reads. A message's files were found by scanning the
-- whole table; a conversation's newest messages and its unread count now use an index too.
-- Additive only. Rollback: DROP INDEX for each (the queries still work, only slower).
CREATE INDEX IF NOT EXISTS idx_message_files_message ON message_files (message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id, sender_id) WHERE is_read = 0 AND deleted_at IS NULL;
