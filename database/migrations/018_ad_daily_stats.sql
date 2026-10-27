-- -----------------------------------------------------
-- Migration 018: per-day ad stats (for time-series charts)
--
-- The ads table already tracks lifetime counters. This rolls up
-- views + clicks per day per ad so the user dashboard can plot a
-- chart and the admin can see daily performance without a giant
-- per-event log.
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_stats_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_id INT NOT NULL,
  day DATE NOT NULL,
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ad_day (ad_id, day),
  INDEX idx_ad_day_recent (ad_id, day DESC),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
