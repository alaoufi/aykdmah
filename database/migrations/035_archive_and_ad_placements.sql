-- Repair a legacy LONGTEXT migration that PostgreSQL previously skipped.
CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP DEFAULT NULL,
  last_message_at TIMESTAMP DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP DEFAULT NULL,
  payload TEXT DEFAULT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','restored','deleted'))
);
CREATE INDEX IF NOT EXISTS idx_archives_conv ON conversation_archives(conversation_id);
CREATE INDEX IF NOT EXISTS idx_archives_expires ON conversation_archives(expires_at, status);
-- Permit every placement offered by the pricing and campaign workflow.
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_placement_check;
ALTER TABLE ads ADD CONSTRAINT ads_placement_check CHECK (placement IN (
  'home_top','home_hero','home_middle','home_bottom','services_top','services_bottom',
  'category_top','category_bottom','request_details_top','request_details_bottom',
  'sidebar','search','profile_top','chat_sidebar','footer'
));
