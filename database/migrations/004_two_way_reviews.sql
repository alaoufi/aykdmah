-- -----------------------------------------------------
-- Migration 004: Two-way ratings + multilingual translations
-- - Extends `reviews` to support both directions
--     (client→provider, provider→client) with multi-criteria scores
--     and original-language metadata
-- - Adds review_translations cache, review_votes (helpful), review_reports
-- - Column additions are individually idempotent; duplicate constraint DDL
--   is handled by the journaled PostgreSQL migration runner.
-- -----------------------------------------------------

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS review_type ENUM('on_provider','on_requester') DEFAULT 'on_provider' AFTER provider_id,
  ADD COLUMN IF NOT EXISTS target_user_id INT DEFAULT NULL AFTER review_type,
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(5) DEFAULT 'ar' AFTER comment,
  ADD COLUMN IF NOT EXISTS criteria_ratings JSON DEFAULT NULL AFTER rating,
  ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0;

-- Backfill: legacy rows are all client→provider, so target = provider_id
UPDATE reviews SET target_user_id = provider_id WHERE target_user_id IS NULL;
UPDATE reviews SET review_type = 'on_provider' WHERE review_type IS NULL;

-- One review per (order, reviewer, direction). Drop old single-direction key.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_request;
ALTER TABLE reviews ADD UNIQUE KEY uq_review_request_type (request_id, reviewer_id, review_type);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_user_id, review_type, is_visible);

-- -----------------------------------------------------
-- Translation cache: original written once, viewers see their language
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS review_translations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL,
  language VARCHAR(5) NOT NULL,
  translated_text TEXT NOT NULL,
  provider VARCHAR(40) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_lang (review_id, language),
  INDEX idx_rt_review (review_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Helpful votes (one per user per review)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS review_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL,
  user_id INT NOT NULL,
  vote ENUM('helpful') DEFAULT 'helpful',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_user_vote (review_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Abuse reports (review hidden automatically after threshold)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS review_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL,
  reporter_id INT NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT DEFAULT NULL,
  status ENUM('pending','reviewed','dismissed') DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_reports_status (status),
  INDEX idx_reports_review (review_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings for moderation
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('review_auto_hide_reports', '3', 'number', 'general', 0, 'إخفاء تلقائي للتقييم عند بلوغ هذا العدد من البلاغات'),
('review_translation_provider', 'mymemory', 'string', 'general', 0, 'مزود الترجمة (mymemory | google | none)'),
('google_translate_api_key', '', 'string', 'general', 0, 'مفتاح Google Translate API (اختياري)');
