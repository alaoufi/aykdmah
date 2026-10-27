-- -----------------------------------------------------
-- Migration 016: user-submitted ad requests
--
-- Any signed-in user (provider or client) can submit an ad. The ad
-- moves through:
--   requested → approved → awaiting_payment → active → expired
-- and may end at whichever happens first — ends_at OR max_views.
--
-- Admin-created ads remain supported: user_id stays NULL, status
-- is 'active' so they don't need approval or payment.
-- -----------------------------------------------------

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS status ENUM('requested','approved','awaiting_payment','active','rejected','expired','cancelled','paused')
                    NOT NULL DEFAULT 'active' AFTER is_active,
  ADD COLUMN IF NOT EXISTS placements JSON DEFAULT NULL AFTER placement,
  ADD COLUMN IF NOT EXISTS max_views INT DEFAULT NULL AFTER ends_at,
  ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL AFTER max_views,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER duration_days,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL AFTER rejection_reason,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL AFTER approved_by,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL AFTER approved_at,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL DEFAULT NULL AFTER rejected_at,
  ADD COLUMN IF NOT EXISTS payment_id INT DEFAULT NULL AFTER paid_at,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP NULL DEFAULT NULL AFTER payment_id,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER activated_at;

ALTER TABLE ads ADD CONSTRAINT fk_ads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ads ADD CONSTRAINT fk_ads_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ads ADD CONSTRAINT fk_ads_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

-- Pricing + limits, exposed in /admin/settings. is_public=1 so the
-- /promote form can read the rates without an admin token.
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_user_requests_enabled', 'true', 'boolean', 'auth', 1, 'السماح للمستخدمين بطلب نشر إعلانات'),
('ads_price_per_day',          '5',   'number',  'auth', 1, 'سعر اليوم الواحد للإعلان (ر.س)'),
('ads_price_per_1k_views',     '10',  'number',  'auth', 1, 'سعر كل 1000 مشاهدة للإعلان (ر.س)'),
('ads_min_duration_days',      '1',   'number',  'auth', 1, 'الحد الأدنى لمدة الإعلان (أيام)'),
('ads_max_duration_days',      '90',  'number',  'auth', 1, 'الحد الأعلى لمدة الإعلان (أيام)'),
('ads_min_views',              '500', 'number',  'auth', 1, 'الحد الأدنى لعدد المشاهدات'),
('ads_max_views',              '100000','number','auth', 1, 'الحد الأعلى لعدد المشاهدات');
