-- -----------------------------------------------------
-- Migration 045: referral coupons and provider wallets
--
-- * Every provider gets a unique coupon code (users.referral_code).
-- * A new account may register with someone's coupon (users.referred_by).
-- * The referrer earns a percentage of the referred account's FIRST completed
--   gateway payment, once (referral_rewards.referred_user_id is unique).
-- * Balances are never stored: they are the sum of wallet_transactions
--   (credits positive, debits negative; cancelled rows excluded).
-- * Withdrawals hold funds as a pending debit until an administrator marks
--   them paid (completed) or rejects them (cancelled, funds released).
--
-- Rollback:
--   DROP TABLE IF EXISTS withdrawal_requests;
--   DROP TABLE IF EXISTS referral_rewards;
--   DROP TABLE IF EXISTS wallet_transactions;
--   ALTER TABLE users DROP COLUMN IF EXISTS referred_by;
--   ALTER TABLE users DROP COLUMN IF EXISTS referral_code;
--   DELETE FROM settings WHERE setting_key IN ('referral_commission_percent', 'wallet_min_withdrawal');
-- -----------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  related_user_id INT DEFAULT NULL,
  reference_type VARCHAR(30) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  note VARCHAR(500) DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transactions (type, created_at);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referred_user_id INT NOT NULL UNIQUE,
  referrer_id INT NOT NULL,
  payment_id INT NOT NULL UNIQUE,
  payment_amount DECIMAL(12,2) NOT NULL,
  percent DECIMAL(5,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  wallet_transaction_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards (referrer_id);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  iban VARCHAR(34) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  wallet_transaction_id INT NOT NULL,
  admin_note VARCHAR(500) DEFAULT NULL,
  transfer_reference VARCHAR(100) DEFAULT NULL,
  processed_by INT DEFAULT NULL,
  processed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests (user_id);

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('referral_commission_percent', '0', 'number', 'payments', 0, 'نسبة صاحب الكوبون من أول دفعة للمسجل الجديد %')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
VALUES ('wallet_min_withdrawal', '50', 'number', 'payments', 0, 'أقل مبلغ لطلب سحب الرصيد (ريال)')
ON CONFLICT (setting_key) DO NOTHING;
