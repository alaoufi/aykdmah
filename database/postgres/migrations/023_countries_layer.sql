-- Auto-generated from database/migrations/023_countries_layer.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(2) NOT NULL UNIQUE,           
  name_ar VARCHAR(80) NOT NULL,
  name_en VARCHAR(80) NOT NULL,
  flag_emoji VARCHAR(8) DEFAULT NULL,
  dial_code VARCHAR(8) DEFAULT NULL,         
  currency_code VARCHAR(6) NOT NULL,         
  currency_symbol VARCHAR(16) DEFAULT NULL,  
  
  
  
  languages_enabled JSONB DEFAULT NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO countries
  (code, name_ar, name_en, flag_emoji, dial_code, currency_code, currency_symbol, languages_enabled, sort_order) VALUES
('SA', 'السعودية',    'Saudi Arabia',         '🇸🇦', '+966', 'SAR', 'ر.س', jsonb_build_array('ar','en','ur','bn','hi'), 1),
('AE', 'الإمارات',     'United Arab Emirates', '🇦🇪', '+971', 'AED', 'د.إ', jsonb_build_array('ar','en','ur','bn','hi'), 2),
('KW', 'الكويت',       'Kuwait',               '🇰🇼', '+965', 'KWD', 'د.ك', jsonb_build_array('ar','en','ur','bn','hi'), 3),
('QA', 'قطر',          'Qatar',                '🇶🇦', '+974', 'QAR', 'ر.ق', jsonb_build_array('ar','en','ur','bn','hi'), 4),
('BH', 'البحرين',      'Bahrain',              '🇧🇭', '+973', 'BHD', 'د.ب', jsonb_build_array('ar','en','ur','bn','hi'), 5),
('OM', 'عُمان',         'Oman',                 '🇴🇲', '+968', 'OMR', 'ر.ع', jsonb_build_array('ar','en','ur','bn','hi'), 6),
('YE', 'اليمن',        'Yemen',                '🇾🇪', '+967', 'YER', 'ر.ي', jsonb_build_array('ar','en'),                7),
('EG', 'مصر',          'Egypt',                '🇪🇬', '+20',  'EGP', 'ج.م', jsonb_build_array('ar','en'),                8),
('JO', 'الأردن',       'Jordan',               '🇯🇴', '+962', 'JOD', 'د.أ', jsonb_build_array('ar','en'),                9),
('PS', 'فلسطين',       'Palestine',            '🇵🇸', '+970', 'JOD', 'د.أ', jsonb_build_array('ar','en'),               10),
('LB', 'لبنان',        'Lebanon',              '🇱🇧', '+961', 'LBP', 'ل.ل', jsonb_build_array('ar','en'),               11),
('SY', 'سوريا',        'Syria',                '🇸🇾', '+963', 'SYP', 'ل.س', jsonb_build_array('ar','en'),               12),
('IQ', 'العراق',       'Iraq',                 '🇮🇶', '+964', 'IQD', 'د.ع', jsonb_build_array('ar','en'),               13),
('MA', 'المغرب',       'Morocco',              '🇲🇦', '+212', 'MAD', 'د.م', jsonb_build_array('ar','en'),               14),
('DZ', 'الجزائر',       'Algeria',              '🇩🇿', '+213', 'DZD', 'د.ج', jsonb_build_array('ar','en'),               15),
('TN', 'تونس',         'Tunisia',              '🇹🇳', '+216', 'TND', 'د.ت', jsonb_build_array('ar','en'),               16),
('LY', 'ليبيا',        'Libya',                '🇱🇾', '+218', 'LYD', 'د.ل', jsonb_build_array('ar','en'),               17),
('SD', 'السودان',      'Sudan',                '🇸🇩', '+249', 'SDG', 'ج.س', jsonb_build_array('ar','en'),               18),
('MR', 'موريتانيا',    'Mauritania',           '🇲🇷', '+222', 'MRU', 'أ.م', jsonb_build_array('ar','en'),               19),
('SO', 'الصومال',      'Somalia',              '🇸🇴', '+252', 'SOS', 'ش.ص', jsonb_build_array('ar','en'),               20),
('DJ', 'جيبوتي',       'Djibouti',             '🇩🇯', '+253', 'DJF', 'ف.ج', jsonb_build_array('ar','en'),               21),
('KM', 'جزر القمر',    'Comoros',              '🇰🇲', '+269', 'KMF', 'ف.ق', jsonb_build_array('ar','en'),               22) ON CONFLICT DO NOTHING;

ALTER TABLE regions ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL;

UPDATE regions SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_region_country ON regions(country_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_user_country ON users(country_id);

UPDATE users SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL AND region_id IS NOT NULL;

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('default_country_code',         'SA',  'string',  'general', 1, 'الدولة الافتراضية التي تظهر أولاً في النموذج'),
('currency_follows_user_country','true','boolean', 'general', 1, 'العملة تتبع دولة المستخدم تلقائياً') ON CONFLICT DO NOTHING;
