-- -----------------------------------------------------
-- Migration 013: provider badge programme (Trusted / Featured)
--
-- Each provider can apply for one or both paid badges.
-- A badge becomes active only when BOTH conditions are met:
--   1. an admin approved the request
--   2. the provider paid the monthly fee (+ optional insurance)
--
-- Admin sets fee + whether an insurance deposit is required from
-- /admin/settings — separately for each badge.
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS provider_badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  badge_type ENUM('trusted', 'featured') NOT NULL,
  -- Workflow status. The badge is only visibly active in 'active' state.
  status ENUM('requested', 'approved', 'awaiting_payment', 'active',
              'rejected', 'expired', 'cancelled') NOT NULL DEFAULT 'requested',

  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  insurance_required TINYINT(1) NOT NULL DEFAULT 0,
  insurance_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  notes TEXT DEFAULT NULL,             -- provider's optional message at request time
  rejection_reason TEXT DEFAULT NULL,  -- admin's reason when rejected

  approved_by INT DEFAULT NULL,        -- admin user id
  approved_at TIMESTAMP NULL DEFAULT NULL,
  rejected_at TIMESTAMP NULL DEFAULT NULL,

  payment_id INT DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,

  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at   TIMESTAMP NULL DEFAULT NULL,

  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (payment_id)  REFERENCES payments(id) ON DELETE SET NULL,
  INDEX idx_pb_user_type (user_id, badge_type),
  INDEX idx_pb_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Denormalised flags on provider_profiles for fast list-time filtering
-- (avoids a JOIN to provider_badges on every offer/provider list).
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS badge_trusted_active   TINYINT(1)   NOT NULL DEFAULT 0 AFTER current_subscription_id,
  ADD COLUMN IF NOT EXISTS badge_trusted_until    TIMESTAMP    NULL DEFAULT NULL  AFTER badge_trusted_active,
  ADD COLUMN IF NOT EXISTS badge_featured_active  TINYINT(1)   NOT NULL DEFAULT 0 AFTER badge_trusted_until,
  ADD COLUMN IF NOT EXISTS badge_featured_until   TIMESTAMP    NULL DEFAULT NULL  AFTER badge_featured_active;

-- Tunables exposed in /admin/settings → group "auth" so admins see them
-- next to verification toggles. is_public=1 so the buy page can read the
-- prices without an admin token.
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('badges_enabled',                       'true', 'boolean', 'auth', 1, 'تفعيل خدمة الشارات (موثوق / متميّز)'),
('badge_trusted_monthly_fee',            '49',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «موثوق» (ر.س)'),
('badge_trusted_insurance_required',     'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «موثوق»؟'),
('badge_trusted_insurance_amount',       '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «موثوق» (ر.س)'),
('badge_featured_monthly_fee',           '99',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «متميّز» (ر.س)'),
('badge_featured_insurance_required',    'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «متميّز»؟'),
('badge_featured_insurance_amount',      '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «متميّز» (ر.س)'),
('badge_duration_days',                  '30',   'number',  'auth', 1, 'مدة صلاحية الشارة بعد الدفع (أيام)');
