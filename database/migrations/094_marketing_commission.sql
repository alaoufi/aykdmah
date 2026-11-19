-- AYK-322 (the owner's design): marketing by commission. Every account's number is a marketing
-- code. The administration turns marketing on or off and picks how a marketer earns:
--   percent       a percentage of the invited account's first payment (as before);
--   count         a fixed amount for every N invited service providers who registered (nothing to
--                 do with subscriptions), settled in cash or by transfer;
--   subscription  a fixed amount when an invited provider's subscription is paid and activated.
-- Marketing stays as it was: on only where a percentage was already set.
-- Additive only. Rollback:
--   DROP TABLE IF EXISTS referral_count_rewards;
--   ALTER TABLE referral_rewards DROP COLUMN mode;
--   DELETE FROM settings WHERE setting_key LIKE 'marketing_%';
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'percent';

-- One row per block of invited providers that was rewarded; `counted` is how many it used up, so a
-- later change of N never pays the same registrations twice.
CREATE TABLE IF NOT EXISTS referral_count_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
