-- Auto-generated from database/migrations/004_two_way_reviews.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS review_type TEXT CHECK (review_type IN ('on_provider','on_requester')) DEFAULT 'on_provider',
  ADD COLUMN IF NOT EXISTS target_user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(5) DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS criteria_ratings JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0;

UPDATE reviews SET target_user_id = provider_id WHERE target_user_id IS NULL;

UPDATE reviews SET review_type = 'on_provider' WHERE review_type IS NULL;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_request;

ALTER TABLE reviews ADD CONSTRAINT uq_review_request_type UNIQUE (request_id, reviewer_id, review_type);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_user_id, review_type, is_visible);

CREATE TABLE IF NOT EXISTS review_translations (
  id BIGSERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  language VARCHAR(5) NOT NULL,
  translated_text TEXT NOT NULL,
  provider VARCHAR(40) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT uq_review_lang UNIQUE (review_id, language)
);

CREATE TABLE IF NOT EXISTS review_votes (
  id SERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  user_id INT NOT NULL,
  vote TEXT CHECK (vote IN ('helpful')) DEFAULT 'helpful',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_review_user_vote UNIQUE (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_reports (
  id SERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  reporter_id INT NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('pending','reviewed','dismissed')) DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('review_auto_hide_reports', '3', 'number', 'general', 0, 'إخفاء تلقائي للتقييم عند بلوغ هذا العدد من البلاغات'),
('review_translation_provider', 'mymemory', 'string', 'general', 0, 'مزود الترجمة (mymemory | google | none)'),
('google_translate_api_key', '', 'string', 'general', 0, 'مفتاح Google Translate API (اختياري)') ON CONFLICT DO NOTHING;
