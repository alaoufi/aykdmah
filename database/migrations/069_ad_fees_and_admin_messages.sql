-- -----------------------------------------------------
-- Migration 069: ad fees by covered region, fee waivers and messages to advertisers (AYK-153)
--
-- 1. The administration can waive an ad's fees: it then runs without payment (amount 0).
-- 2. Messages from the administration to an advertiser about an ad: financial, administrative
--    or legal. The advertiser sees them on "Advertise your service" and gets a notification.
-- The price factor of each covered region is a setting (ads_coverage_pricing), not a table.
--
-- Rollback:
--   DROP TABLE IF EXISTS ad_admin_messages;
--   ALTER TABLE ads DROP COLUMN IF EXISTS fee_waived;
--   ALTER TABLE ads DROP COLUMN IF EXISTS fee_waived_by;
--   ALTER TABLE ads DROP COLUMN IF EXISTS fee_waived_at;
--   ALTER TABLE ads DROP COLUMN IF EXISTS fee_waiver_reason;
--   ALTER TABLE ads DROP COLUMN IF EXISTS coverage_multiplier;
-- -----------------------------------------------------

ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived_by INT NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waived_at TIMESTAMP NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fee_waiver_reason VARCHAR(500) NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS coverage_multiplier DECIMAL(6,2) NULL;

CREATE TABLE IF NOT EXISTS ad_admin_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_id INT NOT NULL,
  admin_id INT NULL,
  category VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ad_admin_messages_ad FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ad_admin_messages_ad ON ad_admin_messages (ad_id);
