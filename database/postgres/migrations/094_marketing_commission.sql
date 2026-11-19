-- Auto-generated from database/migrations/094_marketing_commission.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'percent';
CREATE TABLE IF NOT EXISTS referral_count_rewards (
  id SERIAL PRIMARY KEY,
  referrer_id INT NOT NULL,
  counted INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  wallet_transaction_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_referral_count_rewards_referrer ON referral_count_rewards (referrer_id);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
SELECT 'marketing_enabled',
  CASE WHEN EXISTS (SELECT 1 FROM settings WHERE setting_key = 'referral_commission_percent' AND setting_value NOT IN ('', '0', '0.0', '0.00'))
    THEN 'true' ELSE 'false' END,
  'boolean', 'payments', 0, 'التسويق بالعمولة: مفعّل أو موقوف'
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketing_mode', 'percent', 'string', 'payments', 0, 'طريقة مردود المسوّق: percent نسبة من أول دفعة، count بعدد مقدمي الخدمة المسجلين، subscription مبلغ عند دفع الاشتراك')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketing_count_every', '10', 'number', 'payments', 0, 'طريقة العدد: كل كم مقدم خدمة مسجل')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketing_count_amount', '0', 'number', 'payments', 0, 'طريقة العدد: المبلغ لكل مجموعة (ريال)')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('marketing_subscription_amount', '0', 'number', 'payments', 0, 'طريقة الاشتراك: المبلغ عن كل مقدم خدمة دفع اشتراكه وتفعّل (ريال)')
ON CONFLICT (setting_key) DO NOTHING;
