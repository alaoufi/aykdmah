-- Auto-generated from database/migrations/005_verification_and_integrations.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE TABLE IF NOT EXISTS api_integrations (
  id SERIAL PRIMARY KEY,
  
  
  type VARCHAR(40) NOT NULL,
  
  
  provider VARCHAR(60) NOT NULL,
  label VARCHAR(120) DEFAULT NULL,
  is_enabled SMALLINT DEFAULT 0,
  is_primary SMALLINT DEFAULT 0,
  mode TEXT CHECK (mode IN ('sandbox','live')) DEFAULT 'sandbox',
  
  config JSONB DEFAULT NULL,
  
  
  credentials_encrypted TEXT DEFAULT NULL,
  webhook_url VARCHAR(255) DEFAULT NULL,
  rate_limit_per_min INT DEFAULT NULL,
  last_test_at TIMESTAMP NULL DEFAULT NULL,
  last_test_ok SMALLINT DEFAULT NULL,
  last_test_message VARCHAR(255) DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  integration_id INT DEFAULT NULL,
  type VARCHAR(40) NOT NULL,
  provider VARCHAR(60) DEFAULT NULL,
  user_id INT DEFAULT NULL,
  action VARCHAR(60) NOT NULL,   
  status TEXT CHECK (status IN ('ok','error')) NOT NULL,
  http_status INT DEFAULT NULL,
  request_meta JSONB DEFAULT NULL,
  error_message VARCHAR(500) DEFAULT NULL,
  latency_ms INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (integration_id) REFERENCES api_integrations(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_verifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  method TEXT CHECK (method IN ('nafath','sms','whatsapp','email')) NOT NULL,
  status TEXT CHECK (status IN ('pending','verified','expired','failed')) DEFAULT 'pending',
  identifier VARCHAR(190) DEFAULT NULL,   
  verified_at TIMESTAMP NULL DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_method UNIQUE (user_id, method)
);

CREATE TABLE IF NOT EXISTS verification_otps (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  method TEXT CHECK (method IN ('sms','whatsapp','email')) NOT NULL,
  identifier VARCHAR(190) NOT NULL,         
  code_hash VARCHAR(128) NOT NULL,          
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  method VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,   
  result VARCHAR(40) DEFAULT NULL,
  details VARCHAR(500) DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('verify_methods_enabled',          'sms,email',          'string',  'auth', 1, 'طرق التحقق المتاحة (sms,whatsapp,email,nafath)'),
('verify_required_for_provider',    'sms',                'string',  'auth', 1, 'طرق التحقق المطلوبة لمقدّمي الخدمة (مفصولة بفاصلة)'),
('verify_required_for_client',      '',                   'string',  'auth', 1, 'طرق التحقق المطلوبة للعملاء (فارغ = اختياري)'),
('verify_block_until_verified',     'false',              'boolean', 'auth', 1, 'منع استخدام المنصة قبل التحقق'),
('verify_otp_length',               '6',                  'number',  'auth', 0, 'طول رمز OTP'),
('verify_otp_ttl_minutes',          '10',                 'number',  'auth', 0, 'مدة صلاحية OTP بالدقائق'),
('verify_otp_resend_seconds',       '60',                 'number',  'auth', 0, 'فترة الانتظار قبل إعادة الإرسال (ثوانٍ)'),
('verify_otp_max_attempts',         '5',                  'number',  'auth', 0, 'أقصى عدد محاولات قبل قفل الرمز'),
('verify_email_link_ttl_hours',     '24',                 'number',  'auth', 0, 'مدة صلاحية رابط تأكيد البريد بالساعات'),
('verify_allow_guest_browsing',     'true',               'boolean', 'auth', 1, 'السماح بالتصفّح بدون تسجيل دخول') ON CONFLICT DO NOTHING;
