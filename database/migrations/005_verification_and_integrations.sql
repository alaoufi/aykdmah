-- -----------------------------------------------------
-- Migration 005: Multi-method verification + API integrations
-- -----------------------------------------------------
-- Tables:
--   • api_integrations    — admin-managed provider configs (SMS, WhatsApp,
--                            Email, Nafath, Maps, Payments, …)
--   • api_usage_logs      — per-call audit + error tracking
--   • user_verifications  — one row per (user, method) with current status
--   • verification_otps   — short-lived OTPs awaiting confirmation
--   • verification_audit  — append-only history (every start/confirm/fail)
-- Idempotent (CREATE TABLE IF NOT EXISTS).
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS api_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- Functional slot: 'sms', 'whatsapp', 'email', 'nafath', 'maps',
  -- 'payment', 'ai', 'delivery', …
  type VARCHAR(40) NOT NULL,
  -- Concrete vendor: 'twilio', 'nexmo', 'meta_cloud', 'sendgrid',
  -- 'smtp', 'nafath_sandbox', 'mapbox', 'google', 'openai', …
  provider VARCHAR(60) NOT NULL,
  label VARCHAR(120) DEFAULT NULL,
  is_enabled TINYINT(1) DEFAULT 0,
  is_primary TINYINT(1) DEFAULT 0,
  mode ENUM('sandbox','live') DEFAULT 'sandbox',
  -- Non-secret config (account ids, endpoints, sender names, …)
  config JSON DEFAULT NULL,
  -- Encrypted blob (AES-256-GCM, base64). Holds api keys/secrets.
  -- See utils/encryption.js.
  credentials_encrypted TEXT DEFAULT NULL,
  webhook_url VARCHAR(255) DEFAULT NULL,
  rate_limit_per_min INT DEFAULT NULL,
  last_test_at TIMESTAMP NULL DEFAULT NULL,
  last_test_ok TINYINT(1) DEFAULT NULL,
  last_test_message VARCHAR(255) DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_integrations_type (type, is_enabled),
  INDEX idx_integrations_primary (type, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  integration_id INT DEFAULT NULL,
  type VARCHAR(40) NOT NULL,
  provider VARCHAR(60) DEFAULT NULL,
  user_id INT DEFAULT NULL,
  action VARCHAR(60) NOT NULL,   -- 'send_otp', 'verify_id', 'send_msg', …
  status ENUM('ok','error') NOT NULL,
  http_status INT DEFAULT NULL,
  request_meta JSON DEFAULT NULL,
  error_message VARCHAR(500) DEFAULT NULL,
  latency_ms INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (integration_id) REFERENCES api_integrations(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_usage_type_time (type, created_at),
  INDEX idx_usage_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method ENUM('nafath','sms','whatsapp','email') NOT NULL,
  status ENUM('pending','verified','expired','failed') DEFAULT 'pending',
  identifier VARCHAR(190) DEFAULT NULL,   -- phone / email / national id
  verified_at TIMESTAMP NULL DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_method (user_id, method),
  INDEX idx_userver_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_otps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method ENUM('sms','whatsapp','email') NOT NULL,
  identifier VARCHAR(190) NOT NULL,         -- phone or email to deliver to
  code_hash VARCHAR(128) NOT NULL,          -- sha256(code + salt)
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_otp_lookup (user_id, method, consumed_at),
  INDEX idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,   -- 'start','send','confirm','fail','expire'
  result VARCHAR(40) DEFAULT NULL,
  details VARCHAR(500) DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_vaudit_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification policy + defaults (admin-tunable via /admin/settings)
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('verify_methods_enabled',          'sms,email',          'string',  'auth', 1, 'طرق التحقق المتاحة (sms,whatsapp,email,nafath)'),
('verify_required_for_provider',    'sms',                'string',  'auth', 1, 'طرق التحقق المطلوبة لمقدّمي الخدمة (مفصولة بفاصلة)'),
('verify_required_for_client',      '',                   'string',  'auth', 1, 'طرق التحقق المطلوبة للعملاء (فارغ = اختياري)'),
('verify_block_until_verified',     'false',              'boolean', 'auth', 1, 'منع استخدام المنصة قبل التحقق'),
('verify_otp_length',               '6',                  'number',  'auth', 0, 'طول رمز OTP'),
('verify_otp_ttl_minutes',          '10',                 'number',  'auth', 0, 'مدة صلاحية OTP بالدقائق'),
('verify_otp_resend_seconds',       '60',                 'number',  'auth', 0, 'فترة الانتظار قبل إعادة الإرسال (ثوانٍ)'),
('verify_otp_max_attempts',         '5',                  'number',  'auth', 0, 'أقصى عدد محاولات قبل قفل الرمز'),
('verify_email_link_ttl_hours',     '24',                 'number',  'auth', 0, 'مدة صلاحية رابط تأكيد البريد بالساعات'),
('verify_allow_guest_browsing',     'true',               'boolean', 'auth', 1, 'السماح بالتصفّح بدون تسجيل دخول');
