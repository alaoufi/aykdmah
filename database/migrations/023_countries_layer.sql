-- -----------------------------------------------------
-- Migration 023: countries + per-country admin org / currency / languages
--
-- Adds the country layer above region → governorate → city →
-- district. Each country carries its own currency, dial code, flag,
-- and list of enabled UI languages. Admins can enable / disable any
-- country from /admin/countries; only enabled countries appear in
-- the register form and hero search.
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(2) NOT NULL UNIQUE,           -- ISO 3166-1 alpha-2 (SA, EG, AE…)
  name_ar VARCHAR(80) NOT NULL,
  name_en VARCHAR(80) NOT NULL,
  flag_emoji VARCHAR(8) DEFAULT NULL,
  dial_code VARCHAR(8) DEFAULT NULL,         -- e.g. +966
  currency_code VARCHAR(6) NOT NULL,         -- ISO 4217 (SAR, EGP, AED…)
  currency_symbol VARCHAR(16) DEFAULT NULL,  -- ر.س / ج.م / د.إ
  -- JSON array of supported UI language codes for this country.
  -- The LanguageSwitcher filters to this list when the user has
  -- selected a country.
  languages_enabled JSON DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_country_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the 22 Arab League states. GCC first (highest sort_order
-- weight = lower number, shown first). All start enabled — admin
-- can disable any from /admin/countries.
INSERT IGNORE INTO countries
  (code, name_ar, name_en, flag_emoji, dial_code, currency_code, currency_symbol, languages_enabled, sort_order) VALUES
('SA', 'السعودية',    'Saudi Arabia',         '🇸🇦', '+966', 'SAR', 'ر.س', JSON_ARRAY('ar','en','ur','bn','hi'), 1),
('AE', 'الإمارات',     'United Arab Emirates', '🇦🇪', '+971', 'AED', 'د.إ', JSON_ARRAY('ar','en','ur','bn','hi'), 2),
('KW', 'الكويت',       'Kuwait',               '🇰🇼', '+965', 'KWD', 'د.ك', JSON_ARRAY('ar','en','ur','bn','hi'), 3),
('QA', 'قطر',          'Qatar',                '🇶🇦', '+974', 'QAR', 'ر.ق', JSON_ARRAY('ar','en','ur','bn','hi'), 4),
('BH', 'البحرين',      'Bahrain',              '🇧🇭', '+973', 'BHD', 'د.ب', JSON_ARRAY('ar','en','ur','bn','hi'), 5),
('OM', 'عُمان',         'Oman',                 '🇴🇲', '+968', 'OMR', 'ر.ع', JSON_ARRAY('ar','en','ur','bn','hi'), 6),
('YE', 'اليمن',        'Yemen',                '🇾🇪', '+967', 'YER', 'ر.ي', JSON_ARRAY('ar','en'),                7),
('EG', 'مصر',          'Egypt',                '🇪🇬', '+20',  'EGP', 'ج.م', JSON_ARRAY('ar','en'),                8),
('JO', 'الأردن',       'Jordan',               '🇯🇴', '+962', 'JOD', 'د.أ', JSON_ARRAY('ar','en'),                9),
('PS', 'فلسطين',       'Palestine',            '🇵🇸', '+970', 'JOD', 'د.أ', JSON_ARRAY('ar','en'),               10),
('LB', 'لبنان',        'Lebanon',              '🇱🇧', '+961', 'LBP', 'ل.ل', JSON_ARRAY('ar','en'),               11),
('SY', 'سوريا',        'Syria',                '🇸🇾', '+963', 'SYP', 'ل.س', JSON_ARRAY('ar','en'),               12),
('IQ', 'العراق',       'Iraq',                 '🇮🇶', '+964', 'IQD', 'د.ع', JSON_ARRAY('ar','en'),               13),
('MA', 'المغرب',       'Morocco',              '🇲🇦', '+212', 'MAD', 'د.م', JSON_ARRAY('ar','en'),               14),
('DZ', 'الجزائر',       'Algeria',              '🇩🇿', '+213', 'DZD', 'د.ج', JSON_ARRAY('ar','en'),               15),
('TN', 'تونس',         'Tunisia',              '🇹🇳', '+216', 'TND', 'د.ت', JSON_ARRAY('ar','en'),               16),
('LY', 'ليبيا',        'Libya',                '🇱🇾', '+218', 'LYD', 'د.ل', JSON_ARRAY('ar','en'),               17),
('SD', 'السودان',      'Sudan',                '🇸🇩', '+249', 'SDG', 'ج.س', JSON_ARRAY('ar','en'),               18),
('MR', 'موريتانيا',    'Mauritania',           '🇲🇷', '+222', 'MRU', 'أ.م', JSON_ARRAY('ar','en'),               19),
('SO', 'الصومال',      'Somalia',              '🇸🇴', '+252', 'SOS', 'ش.ص', JSON_ARRAY('ar','en'),               20),
('DJ', 'جيبوتي',       'Djibouti',             '🇩🇯', '+253', 'DJF', 'ف.ج', JSON_ARRAY('ar','en'),               21),
('KM', 'جزر القمر',    'Comoros',              '🇰🇲', '+269', 'KMF', 'ف.ق', JSON_ARRAY('ar','en'),               22);

-- Link existing regions to a country. All current rows belong to
-- Saudi Arabia (the original seed). Future regions added by other
-- countries' admins will set their own country_id.
ALTER TABLE regions ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL;
UPDATE regions SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_region_country ON regions(country_id);

-- Users record which country they picked at sign-up (so we can show
-- them prices in the right currency + filter their language menu).
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_user_country ON users(country_id);
UPDATE users SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL AND region_id IS NOT NULL;

INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('default_country_code',         'SA',  'string',  'general', 1, 'الدولة الافتراضية التي تظهر أولاً في النموذج'),
('currency_follows_user_country','true','boolean', 'general', 1, 'العملة تتبع دولة المستخدم تلقائياً');
