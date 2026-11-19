-- Auto-generated from database/migrations/069_ad_fees_and_admin_messages.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived_by INT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived_at TIMESTAMP NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waiver_reason VARCHAR(500) NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS coverage_multiplier DECIMAL(6,2) NULL;
CREATE TABLE IF NOT EXISTS ad_admin_messages (
  id SERIAL PRIMARY KEY,
  ad_id INT NOT NULL,
  admin_id INT NULL,
  category VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ad_admin_messages_ad FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ad_admin_messages_ad ON ad_admin_messages (ad_id);
