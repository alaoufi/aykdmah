-- Auto-generated from database/migrations/013_provider_badges.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE TABLE IF NOT EXISTS provider_badges (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  badge_type TEXT CHECK (badge_type IN ('trusted', 'featured')) NOT NULL,
  
  status TEXT CHECK (status IN ('requested', 'approved', 'awaiting_payment', 'active',
              'rejected', 'expired', 'cancelled')) NOT NULL DEFAULT 'requested',

  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  insurance_required SMALLINT NOT NULL DEFAULT 0,
  insurance_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  notes TEXT DEFAULT NULL,             
  rejection_reason TEXT DEFAULT NULL,  

  approved_by INT DEFAULT NULL,        
  approved_at TIMESTAMP NULL DEFAULT NULL,
  rejected_at TIMESTAMP NULL DEFAULT NULL,

  payment_id INT DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,

  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at   TIMESTAMP NULL DEFAULT NULL,

  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (payment_id)  REFERENCES payments(id) ON DELETE SET NULL
);

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS badge_trusted_active   SMALLINT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_trusted_until    TIMESTAMP    NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS badge_featured_active  SMALLINT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_featured_until   TIMESTAMP    NULL DEFAULT NULL;

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('badges_enabled',                       'true', 'boolean', 'auth', 1, 'تفعيل خدمة الشارات (موثوق / متميّز)'),
('badge_trusted_monthly_fee',            '49',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «موثوق» (ر.س)'),
('badge_trusted_insurance_required',     'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «موثوق»؟'),
('badge_trusted_insurance_amount',       '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «موثوق» (ر.س)'),
('badge_featured_monthly_fee',           '99',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «متميّز» (ر.س)'),
('badge_featured_insurance_required',    'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «متميّز»؟'),
('badge_featured_insurance_amount',      '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «متميّز» (ر.س)'),
('badge_duration_days',                  '30',   'number',  'auth', 1, 'مدة صلاحية الشارة بعد الدفع (أيام)') ON CONFLICT DO NOTHING;
