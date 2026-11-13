-- Auto-generated from database/migrations/016_user_ad_requests.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('requested','approved','awaiting_payment','active','rejected','expired','cancelled','paused'))
                    NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS placements JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_views INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE ads ADD CONSTRAINT fk_ads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ads ADD CONSTRAINT fk_ads_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ads ADD CONSTRAINT fk_ads_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);

CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_user_requests_enabled', 'true', 'boolean', 'auth', 1, 'السماح للمستخدمين بطلب نشر إعلانات'),
('ads_price_per_day',          '5',   'number',  'auth', 1, 'سعر اليوم الواحد للإعلان (ر.س)'),
('ads_price_per_1k_views',     '10',  'number',  'auth', 1, 'سعر كل 1000 مشاهدة للإعلان (ر.س)'),
('ads_min_duration_days',      '1',   'number',  'auth', 1, 'الحد الأدنى لمدة الإعلان (أيام)'),
('ads_max_duration_days',      '90',  'number',  'auth', 1, 'الحد الأعلى لمدة الإعلان (أيام)'),
('ads_min_views',              '500', 'number',  'auth', 1, 'الحد الأدنى لعدد المشاهدات'),
('ads_max_views',              '100000','number','auth', 1, 'الحد الأعلى لعدد المشاهدات') ON CONFLICT DO NOTHING;
