-- Auto-generated PostgreSQL bootstrap for a FRESH database only.
-- Refuses existing application tables. Use the journaled migration runner for upgrades.
-- All required statements and migration journal writes commit together.
-- DO NOT EDIT — regenerate via NODE_ENV=test node scripts/dump-pg-sql.js.
BEGIN;
SELECT pg_advisory_xact_lock(742981);
DO $ryza_fresh$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r','p','v','m','f')
      AND c.relname IN ('activity_logs','ad_media','ad_placement_pricing','ad_stats_daily','ads','api_integrations','api_usage_logs','auth_rate_limits','categories','cities','conversation_archives','conversation_participants','conversations','countries','dispute_access_logs','dispute_evidence','dispute_messages','dispute_status_logs','disputes','districts','governorates','install_lock','ip_geo_cache','location_shares','message_files','messages','notifications','offers','payments','provider_badges','provider_profiles','regions','request_files','requests','review_reports','review_translations','review_votes','reviews','roles','schema_migrations','services','settings','subscription_plans','subscriptions','uploaded_media','user_profiles','user_verifications','users','verification_audit','verification_otps','verification_requests')
  ) THEN
    RAISE EXCEPTION 'AWTAD SERVICES bootstrap requires a fresh database schema; use journaled migrations for an existing installation';
  END IF;
END $ryza_fresh$;
CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- schema.sql
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS regions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) DEFAULT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  capital_ar VARCHAR(120) DEFAULT NULL,
  capital_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_regions_name UNIQUE (name_ar)
);
CREATE TABLE IF NOT EXISTS governorates (
  id SERIAL PRIMARY KEY,
  region_id INT NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_capital SMALLINT DEFAULT 0,
  is_active SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
  CONSTRAINT uq_gov_region_name UNIQUE (region_id, name_ar)
);
CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  governorate_id INT DEFAULT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (governorate_id) REFERENCES governorates(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS districts (
  id SERIAL PRIMARY KEY,
  city_id INT NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) DEFAULT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  icon VARCHAR(255) DEFAULT NULL,
  color VARCHAR(20) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) DEFAULT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  icon VARCHAR(255) DEFAULT NULL,
  base_price DECIMAL(10,2) DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  is_urgent_supported SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role TEXT CHECK (role IN ('admin','provider','client')) NOT NULL DEFAULT 'client',
  avatar VARCHAR(255) DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  is_blocked SMALLINT DEFAULT 0,
  is_verified SMALLINT DEFAULT 0,
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  phone_verified_at TIMESTAMP NULL DEFAULT NULL,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  last_seen_at TIMESTAMP NULL DEFAULT NULL,
  is_online SMALLINT DEFAULT 0,
  city_id INT DEFAULT NULL,
  district_id INT DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  bio TEXT DEFAULT NULL,
  birth_date DATE DEFAULT NULL,
  gender TEXT CHECK (gender IN ('male','female','other')) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  preferences JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS provider_profiles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  business_name VARCHAR(200) DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  experience_years INT DEFAULT 0,
  category_id INT DEFAULT NULL,
  service_ids JSONB DEFAULT NULL,
  service_radius_km INT DEFAULT 25,
  hourly_rate DECIMAL(10,2) DEFAULT NULL,
  cover_image VARCHAR(255) DEFAULT NULL,
  gallery JSONB DEFAULT NULL,
  verification_status TEXT CHECK (verification_status IN ('pending','verified','rejected','none')) DEFAULT 'none',
  verified_at TIMESTAMP NULL DEFAULT NULL,
  rating_avg DECIMAL(3,2) DEFAULT 0.00,
  rating_count INT DEFAULT 0,
  completed_orders INT DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0.00,
  is_featured SMALLINT DEFAULT 0,
  featured_until TIMESTAMP NULL DEFAULT NULL,
  current_subscription_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS verification_requests (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  document_type TEXT CHECK (document_type IN ('national_id','commercial_register','license','other')) NOT NULL,
  document_url VARCHAR(255) NOT NULL,
  notes TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL,
  category_id INT DEFAULT NULL,
  service_id INT DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  city_id INT DEFAULT NULL,
  district_id INT DEFAULT NULL,
  address TEXT DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  budget_min DECIMAL(10,2) DEFAULT NULL,
  budget_max DECIMAL(10,2) DEFAULT NULL,
  preferred_date TIMESTAMP DEFAULT NULL,
  is_urgent SMALLINT DEFAULT 0,
  status TEXT CHECK (status IN ('open','assigned','in_progress','completed','cancelled','closed')) NOT NULL DEFAULT 'open',
  assigned_provider_id INT DEFAULT NULL,
  accepted_offer_id INT DEFAULT NULL,
  views_count INT DEFAULT 0,
  offers_count INT DEFAULT 0,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  cancellation_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_provider_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS request_files (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  provider_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  message TEXT DEFAULT NULL,
  estimated_duration VARCHAR(100) DEFAULT NULL,
  available_from TIMESTAMP DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  location_accuracy DECIMAL(10,2) DEFAULT NULL,
  status TEXT CHECK (status IN ('pending','accepted','rejected','withdrawn')) DEFAULT 'pending',
  accepted_at TIMESTAMP NULL DEFAULT NULL,
  rejected_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_offer_provider_request UNIQUE (request_id, provider_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  request_id INT DEFAULT NULL,
  title VARCHAR(200) DEFAULT NULL,
  last_message_id INT DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS conversation_participants (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_read_at TIMESTAMP NULL DEFAULT NULL,
  is_muted SMALLINT DEFAULT 0,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_conv_user UNIQUE (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT DEFAULT NULL,
  message_type TEXT CHECK (message_type IN ('text','image','file','voice','location','system')) DEFAULT 'text',
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  accuracy_m INT DEFAULT NULL,
  is_read SMALLINT DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  is_edited SMALLINT DEFAULT 0,
  edited_at TIMESTAMP NULL DEFAULT NULL,
  reply_to_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS message_files (
  id SERIAL PRIMARY KEY,
  message_id INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS location_shares (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('client','provider','admin')) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m INT DEFAULT NULL,
  heading DECIMAL(5,2) DEFAULT NULL,
  speed_kmh DECIMAL(5,2) DEFAULT NULL,
  is_live SMALLINT DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS disputes (
  id SERIAL PRIMARY KEY,
  request_id INT DEFAULT NULL,
  conversation_id INT DEFAULT NULL,
  opened_by INT NOT NULL,
  assigned_admin_id INT DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('open','under_review','resolved','closed')) DEFAULT 'open',
  resolution TEXT DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS dispute_access_logs (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  admin_id INT NOT NULL,
  conversation_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP NULL DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  payload TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('active','expired','restored','deleted')) DEFAULT 'active',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  provider_id INT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT NULL,
  images JSONB DEFAULT NULL,
  is_visible SMALLINT DEFAULT 1,
  provider_reply TEXT DEFAULT NULL,
  provider_reply_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_review_request UNIQUE (request_id, reviewer_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT DEFAULT NULL,
  data JSONB DEFAULT NULL,
  link VARCHAR(255) DEFAULT NULL,
  is_read SMALLINT DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  channel TEXT CHECK (channel IN ('in_app','push','email','whatsapp','sms')) DEFAULT 'in_app',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 30,
  max_offers_per_month INT DEFAULT NULL,
  is_featured SMALLINT DEFAULT 0,
  badge VARCHAR(50) DEFAULT NULL,
  features JSONB DEFAULT NULL,
  is_active SMALLINT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  status TEXT CHECK (status IN ('pending','active','expired','cancelled')) DEFAULT 'pending',
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  auto_renew SMALLINT DEFAULT 0,
  payment_id INT DEFAULT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_id INT DEFAULT NULL,
  request_id INT DEFAULT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_transaction_id VARCHAR(190) DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'SAR',
  payment_method VARCHAR(50) DEFAULT NULL,
  status TEXT CHECK (status IN ('pending','processing','completed','failed','refunded','cancelled')) DEFAULT 'pending',
  metadata JSONB DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  refunded_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  link VARCHAR(255) DEFAULT NULL,
  placement TEXT CHECK (placement IN ('home_top','home_middle','home_bottom','sidebar','search')) DEFAULT 'home_top',
  is_active SMALLINT DEFAULT 1,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  views_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_value TEXT DEFAULT NULL,
  setting_type TEXT CHECK (setting_type IN ('string','number','boolean','json','text')) DEFAULT 'string',
  setting_group VARCHAR(80) DEFAULT 'general',
  is_public SMALLINT DEFAULT 0,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) DEFAULT NULL,
  entity_id INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS install_lock (
  id SERIAL PRIMARY KEY,
  is_installed SMALLINT DEFAULT 1,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  installed_version VARCHAR(20) DEFAULT '1.0.0',
  installed_by_email VARCHAR(190) DEFAULT NULL,
  site_name VARCHAR(200) DEFAULT NULL,
  site_url VARCHAR(255) DEFAULT NULL
);

-- seed.sql
INSERT INTO roles (id, name, display_name, description) VALUES
(1, 'admin', 'مدير النظام', 'صلاحيات كاملة'),
(2, 'provider', 'مقدم خدمة', 'يقدم خدمات للعملاء'),
(3, 'client', 'عميل', 'يطلب الخدمات') ON CONFLICT DO NOTHING;
INSERT INTO regions (id, code, name_ar, name_en, capital_ar, capital_en, latitude, longitude, sort_order) VALUES
(1,  'RD', 'منطقة الرياض',         'Riyadh Region',          'الرياض',         'Riyadh',  24.7136, 46.6753, 1),
(2,  'MK', 'منطقة مكة المكرمة',    'Makkah Region',          'مكة المكرمة',    'Makkah',  21.3891, 39.8579, 2),
(3,  'MD', 'منطقة المدينة المنورة','Madinah Region',         'المدينة المنورة','Madinah', 24.5247, 39.5692, 3),
(4,  'QS', 'منطقة القصيم',         'Al-Qassim Region',       'بريدة',          'Buraidah',26.3260, 43.9750, 4),
(5,  'ES', 'المنطقة الشرقية',      'Eastern Region',         'الدمام',         'Dammam',  26.4207, 50.0888, 5),
(6,  'AS', 'منطقة عسير',           'Asir Region',            'أبها',           'Abha',    18.2164, 42.5053, 6),
(7,  'TB', 'منطقة تبوك',           'Tabuk Region',           'تبوك',           'Tabuk',   28.3835, 36.5662, 7),
(8,  'HA', 'منطقة حائل',           'Hail Region',            'حائل',           'Hail',    27.5114, 41.6900, 8),
(9,  'NB', 'منطقة الحدود الشمالية','Northern Borders Region','عرعر',           'Arar',    30.9753, 41.0381, 9),
(10, 'JZ', 'منطقة جازان',          'Jazan Region',           'جازان',          'Jazan',   16.8892, 42.5511, 10),
(11, 'NJ', 'منطقة نجران',          'Najran Region',          'نجران',          'Najran',  17.4924, 44.1277, 11),
(12, 'BH', 'منطقة الباحة',         'Al-Bahah Region',        'الباحة',         'Bahah',   20.0129, 41.4677, 12),
(13, 'JF', 'منطقة الجوف',          'Al-Jouf Region',         'سكاكا',          'Sakaka',  29.9697, 40.2064, 13) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(1,   1, 'الرياض',          'Riyadh',           24.7136, 46.6753, 1, 1),
(2,   1, 'الدرعية',         'Diriyah',          24.7320, 46.5750, 0, 2),
(3,   1, 'الخرج',           'Al-Kharj',         24.1556, 47.3120, 0, 3),
(4,   1, 'الدوادمي',        'Ad-Dawadmi',       24.5061, 44.3923, 0, 4),
(5,   1, 'المجمعة',         'Al-Majmaah',       25.9020, 45.3450, 0, 5),
(6,   1, 'القويعية',        'Al-Quwaiiyah',     24.0667, 45.2833, 0, 6),
(7,   1, 'وادي الدواسر',    'Wadi Ad-Dawasir',  20.4944, 44.8044, 0, 7),
(8,   1, 'الأفلاج',         'Al-Aflaj',         22.2774, 46.7172, 0, 8),
(9,   1, 'الزلفي',          'Az-Zulfi',         26.3000, 44.8000, 0, 9),
(10,  1, 'شقراء',           'Shaqra',           25.2486, 45.2519, 0, 10),
(11,  1, 'حوطة بني تميم',   'Hawtat Bani Tamim',23.5167, 46.8500, 0, 11),
(12,  1, 'عفيف',            'Afif',             23.9061, 42.9170, 0, 12),
(13,  1, 'السليل',          'As-Sulayyil',      20.4607, 45.5763, 0, 13),
(14,  1, 'ضرما',            'Dhurma',           24.6167, 46.1167, 0, 14),
(15,  1, 'المزاحمية',       'Al-Muzahmiyah',    24.4742, 46.2569, 0, 15),
(16,  1, 'رماح',            'Rumah',            25.5808, 47.1422, 0, 16),
(17,  1, 'ثادق',            'Thadiq',           25.2944, 45.8631, 0, 17),
(18,  1, 'حريملاء',         'Huraymila',        25.1167, 46.1167, 0, 18),
(19,  1, 'الحريق',          'Al-Hariq',         23.6128, 46.0978, 0, 19),
(20,  1, 'مرات',            'Marat',            25.0833, 45.4833, 0, 20) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(21,  2, 'مكة المكرمة',     'Makkah',           21.3891, 39.8579, 1, 1),
(22,  2, 'جدة',             'Jeddah',           21.4858, 39.1925, 0, 2),
(23,  2, 'الطائف',          'Taif',             21.2703, 40.4178, 0, 3),
(24,  2, 'القنفذة',         'Al-Qunfudhah',     19.1264, 41.0789, 0, 4),
(25,  2, 'الليث',           'Al-Lith',          20.1500, 40.2667, 0, 5),
(26,  2, 'رابغ',            'Rabigh',           22.7986, 39.0347, 0, 6),
(27,  2, 'خليص',            'Khulays',          22.1500, 39.3333, 0, 7),
(28,  2, 'الجموم',          'Al-Jumum',         21.6217, 39.6981, 0, 8),
(29,  2, 'الكامل',          'Al-Kamil',         22.2017, 39.7975, 0, 9),
(30,  2, 'المويه',          'Al-Muwayh',        22.4453, 41.7367, 0, 10),
(31,  2, 'ميسان',           'Maysan',           21.0167, 40.7167, 0, 11),
(32,  2, 'أضم',             'Adham',            20.0833, 41.2333, 0, 12),
(33,  2, 'الخرمة',          'Al-Khurmah',       21.9214, 42.0497, 0, 13),
(34,  2, 'تربة',            'Turabah',          21.2153, 41.6347, 0, 14),
(35,  2, 'رنية',            'Raniyah',          21.2667, 42.8500, 0, 15),
(36,  2, 'العرضيات',        'Al-Ardiyat',       20.0167, 41.4333, 0, 16),
(37,  2, 'بحرة',            'Bahrah',           21.4067, 39.4583, 0, 17) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(38,  3, 'المدينة المنورة', 'Madinah',          24.5247, 39.5692, 1, 1),
(39,  3, 'ينبع',            'Yanbu',            24.0892, 38.0617, 0, 2),
(40,  3, 'العلا',           'Al-Ula',           26.6086, 37.9233, 0, 3),
(41,  3, 'مهد الذهب',       'Mahd Ad-Dahab',    23.4839, 40.8617, 0, 4),
(42,  3, 'الحناكية',        'Al-Henakiyah',     24.8631, 40.5083, 0, 5),
(43,  3, 'بدر',             'Badr',             23.7833, 38.7833, 0, 6),
(44,  3, 'خيبر',            'Khaybar',          25.7000, 39.2833, 0, 7),
(45,  3, 'العيص',           'Al-Ais',           25.8997, 38.5972, 0, 8) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(46,  4, 'بريدة',           'Buraidah',         26.3260, 43.9750, 1, 1),
(47,  4, 'عنيزة',           'Unaizah',          26.0843, 43.9936, 0, 2),
(48,  4, 'الرس',            'Ar-Rass',          25.8667, 43.5000, 0, 3),
(49,  4, 'المذنب',          'Al-Mithnab',       25.8617, 44.2228, 0, 4),
(50,  4, 'البكيرية',        'Al-Bukayriyah',    26.1397, 43.6536, 0, 5),
(51,  4, 'البدائع',         'Al-Badaie',        26.0254, 43.7681, 0, 6),
(52,  4, 'الأسياح',         'Al-Asyah',         26.5167, 44.0833, 0, 7),
(53,  4, 'النبهانية',       'An-Nabhaniyah',    26.4500, 43.4500, 0, 8),
(54,  4, 'الشماسية',        'Ash-Shamasiyah',   26.5000, 44.0500, 0, 9),
(55,  4, 'عيون الجواء',     'Uyun Al-Jiwa',     26.5333, 43.7167, 0, 10),
(56,  4, 'رياض الخبراء',    'Riyad Al-Khabra',  26.5083, 43.5722, 0, 11),
(57,  4, 'ضرية',            'Dariyah',          27.7333, 42.7167, 0, 12),
(58,  4, 'عقلة الصقور',     'Uqlat As-Suqur',   25.8500, 42.1833, 0, 13) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(59,  5, 'الدمام',          'Dammam',           26.4207, 50.0888, 1, 1),
(60,  5, 'الأحساء',         'Al-Ahsa',          25.3833, 49.5833, 0, 2),
(61,  5, 'حفر الباطن',      'Hafar Al-Batin',   28.4337, 45.9601, 0, 3),
(62,  5, 'الجبيل',          'Jubail',           27.0174, 49.6225, 0, 4),
(63,  5, 'القطيف',          'Qatif',            26.5654, 50.0079, 0, 5),
(64,  5, 'الخبر',           'Khobar',           26.2172, 50.1971, 0, 6),
(65,  5, 'الخفجي',          'Al-Khafji',        28.4347, 48.4914, 0, 7),
(66,  5, 'رأس تنورة',       'Ras Tanura',       26.6453, 50.1583, 0, 8),
(67,  5, 'بقيق',            'Buqayq',           25.9342, 49.6664, 0, 9),
(68,  5, 'النعيرية',        'An-Nairyah',       27.4811, 48.4894, 0, 10),
(69,  5, 'قرية العليا',     'Qaryat Al-Ulya',   27.6275, 47.7211, 0, 11),
(70,  5, 'العديد',          'Al-Udayd',         24.6000, 51.3833, 0, 12) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(71,  6, 'أبها',             'Abha',            18.2164, 42.5053, 1, 1),
(72,  6, 'خميس مشيط',        'Khamis Mushait',  18.3000, 42.7333, 0, 2),
(73,  6, 'بيشة',             'Bisha',           19.9774, 42.5908, 0, 3),
(74,  6, 'محايل عسير',       'Mahayil Asir',    18.5500, 42.0333, 0, 4),
(75,  6, 'النماص',           'An-Namas',        19.1500, 42.1167, 0, 5),
(76,  6, 'ظهران الجنوب',     'Dhahran Al-Janub',17.6692, 43.5161, 0, 6),
(77,  6, 'تثليث',            'Tathlith',        19.5667, 43.3000, 0, 7),
(78,  6, 'رجال ألمع',        'Rijal Alma',      18.1922, 42.2569, 0, 8),
(79,  6, 'سراة عبيدة',       'Sarat Abidah',    18.2167, 42.8000, 0, 9),
(80,  6, 'أحد رفيدة',        'Ahad Rafidah',    18.2083, 42.8642, 0, 10),
(81,  6, 'طريب',             'Tarib',           18.7667, 43.3333, 0, 11),
(82,  6, 'بلقرن',            'Balqarn',         19.7167, 42.1500, 0, 12),
(83,  6, 'المجاردة',         'Al-Majaridah',    19.1186, 41.9000, 0, 13),
(84,  6, 'البرك',            'Al-Birk',         18.2333, 41.5333, 0, 14),
(85,  6, 'بارق',             'Bariq',           18.7500, 41.7500, 0, 15),
(86,  6, 'تنومة',            'Tanumah',         19.0875, 42.1719, 0, 16),
(87,  6, 'الحرجة',           'Al-Harajah',      19.3333, 41.9667, 0, 17),
(88,  6, 'العرين',           'Al-Areen',        18.1833, 42.4500, 0, 18) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(89,  7, 'تبوك',             'Tabuk',           28.3835, 36.5662, 1, 1),
(90,  7, 'الوجه',            'Al-Wajh',         26.2419, 36.4642, 0, 2),
(91,  7, 'تيماء',            'Tayma',           27.6306, 38.5453, 0, 3),
(92,  7, 'ضباء',             'Duba',            27.3500, 35.7000, 0, 4),
(93,  7, 'أملج',             'Umluj',           25.0214, 37.2697, 0, 5),
(94,  7, 'حقل',              'Haql',            29.2972, 34.9381, 0, 6),
(95,  7, 'البدع',            'Al-Bada',         28.4667, 35.0000, 0, 7) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(96,  8, 'حائل',             'Hail',            27.5114, 41.6900, 1, 1),
(97,  8, 'بقعاء',            'Baqaa',           27.8833, 42.6500, 0, 2),
(98,  8, 'الغزالة',          'Al-Ghazalah',     26.8167, 41.3333, 0, 3),
(99,  8, 'الشنان',           'Ash-Shinan',      27.4667, 42.6167, 0, 4),
(100, 8, 'الشملي',           'Ash-Shimli',      27.3333, 40.5000, 0, 5),
(101, 8, 'الحائط',           'Al-Hait',         26.0567, 41.7244, 0, 6),
(102, 8, 'السليمي',          'As-Sulaymi',      26.4333, 41.5667, 0, 7),
(103, 8, 'موقق',             'Mawqaq',          27.6500, 41.1167, 0, 8),
(104, 8, 'سميراء',           'Sumayra',         27.5667, 42.2667, 0, 9) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(105, 9, 'عرعر',             'Arar',            30.9753, 41.0381, 1, 1),
(106, 9, 'رفحاء',            'Rafha',           29.6383, 43.4983, 0, 2),
(107, 9, 'طريف',             'Turaif',          31.6725, 38.6638, 0, 3),
(108, 9, 'العويقيلة',        'Al-Uwayqilah',    30.3422, 42.2658, 0, 4) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(109,10, 'جازان',             'Jazan',          16.8892, 42.5511, 1, 1),
(110,10, 'صبيا',              'Sabya',          17.1494, 42.6253, 0, 2),
(111,10, 'أبو عريش',          'Abu Arish',      16.9692, 42.8311, 0, 3),
(112,10, 'صامطة',             'Samtah',         16.5972, 42.9461, 0, 4),
(113,10, 'بيش',               'Baish',          17.3811, 42.5836, 0, 5),
(114,10, 'الدرب',             'Ad-Darb',        17.7228, 42.2528, 0, 6),
(115,10, 'الريث',             'Ar-Reith',       17.5333, 43.0167, 0, 7),
(116,10, 'العارضة',           'Al-Aridhah',     16.9667, 43.0500, 0, 8),
(117,10, 'أحد المسارحة',      'Ahad Al-Masarihah',16.7058,42.9569,0, 9),
(118,10, 'الحرث',             'Al-Harith',      16.7136, 43.0203, 0, 10),
(119,10, 'العيدابي',          'Al-Aydabi',      17.2167, 42.8667, 0, 11),
(120,10, 'الدائر',            'Ad-Dair',        17.4833, 43.2167, 0, 12),
(121,10, 'فرسان',             'Farasan',        16.7000, 42.1167, 0, 13) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(122,11, 'نجران',             'Najran',         17.4924, 44.1277, 1, 1),
(123,11, 'شرورة',             'Sharurah',       17.4664, 47.1147, 0, 2),
(124,11, 'حبونا',             'Habuna',         17.6833, 44.3500, 0, 3),
(125,11, 'بدر الجنوب',        'Badr Al-Janub',  17.9833, 45.6167, 0, 4),
(126,11, 'يدمة',              'Yadamah',        17.5667, 45.0667, 0, 5),
(127,11, 'ثار',               'Thar',           17.7500, 44.3000, 0, 6),
(128,11, 'خباش',              'Khubash',        17.6667, 44.0500, 0, 7) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(129,12, 'الباحة',            'Bahah',          20.0129, 41.4677, 1, 1),
(130,12, 'بلجرشي',            'Baljurashi',     19.8589, 41.5683, 0, 2),
(131,12, 'المندق',            'Al-Mandaq',      20.1933, 41.2825, 0, 3),
(132,12, 'المخواة',           'Al-Mikhwah',     19.7500, 41.4333, 0, 4),
(133,12, 'العقيق',            'Al-Aqiq',        20.2861, 41.6494, 0, 5),
(134,12, 'القرى',             'Al-Qura',        20.3000, 41.3000, 0, 6),
(135,12, 'قلوة',              'Qilwah',         19.6667, 41.4167, 0, 7),
(136,12, 'الحجرة',            'Al-Hajrah',      19.7833, 41.6000, 0, 8),
(137,12, 'بني حسن',           'Bani Hassan',    20.1000, 41.3667, 0, 9),
(138,12, 'غامد الزناد',       'Ghamid Az-Zinad',20.1500, 41.5167, 0, 10) ON CONFLICT DO NOTHING;
INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(139,13, 'سكاكا',             'Sakaka',         29.9697, 40.2064, 1, 1),
(140,13, 'القريات',           'Al-Qurayyat',    31.3320, 37.3450, 0, 2),
(141,13, 'دومة الجندل',       'Dumat Al-Jandal',29.8000, 39.8667, 0, 3),
(142,13, 'طبرجل',             'Tabarjal',       30.5000, 38.2167, 0, 4) ON CONFLICT DO NOTHING;
INSERT INTO cities (id, governorate_id, name_ar, name_en, latitude, longitude, is_active, sort_order) VALUES
(1,   1, 'الرياض',          'Riyadh',   24.7136, 46.6753, 1, 1),
(2,  22, 'جدة',             'Jeddah',   21.4858, 39.1925, 1, 2),
(3,  21, 'مكة المكرمة',     'Makkah',   21.3891, 39.8579, 1, 3),
(4,  38, 'المدينة المنورة', 'Madinah',  24.5247, 39.5692, 1, 4),
(5,  59, 'الدمام',          'Dammam',   26.4207, 50.0888, 1, 5),
(6,  64, 'الخبر',           'Khobar',   26.2172, 50.1971, 1, 6),
(7,  23, 'الطائف',          'Taif',     21.2703, 40.4178, 1, 7),
(8,  89, 'تبوك',            'Tabuk',    28.3835, 36.5662, 1, 8),
(9,  46, 'بريدة',           'Buraidah', 26.3260, 43.9750, 1, 9),
(10, 71, 'أبها',            'Abha',     18.2164, 42.5053, 1, 10),

(11, 60, 'الهفوف',          'Hofuf',    25.3833, 49.5833, 1, 11),
(12, 60, 'المبرز',          'Al-Mubarraz',25.4081, 49.5910, 1, 12),
(13, 62, 'الجبيل',          'Jubail',   27.0174, 49.6225, 1, 13),
(14, 63, 'القطيف',          'Qatif',    26.5654, 50.0079, 1, 14),
(15, 39, 'ينبع',            'Yanbu',    24.0892, 38.0617, 1, 15),
(16, 47, 'عنيزة',           'Unaizah',  26.0843, 43.9936, 1, 16),
(17, 48, 'الرس',            'Ar-Rass',  25.8667, 43.5000, 1, 17),
(18, 72, 'خميس مشيط',       'Khamis Mushait',18.3000,42.7333,1, 18),
(19, 73, 'بيشة',            'Bisha',    19.9774, 42.5908, 1, 19),
(20,109, 'جازان',            'Jazan',   16.8892, 42.5511, 1, 20),
(21,122, 'نجران',           'Najran',   17.4924, 44.1277, 1, 21),
(22,129, 'الباحة',          'Bahah',    20.0129, 41.4677, 1, 22),
(23,139, 'سكاكا',           'Sakaka',   29.9697, 40.2064, 1, 23),
(24, 96, 'حائل',            'Hail',     27.5114, 41.6900, 1, 24),
(25,105, 'عرعر',            'Arar',     30.9753, 41.0381, 1, 25),
(26,  3, 'الخرج',           'Al-Kharj', 24.1556, 47.3120, 1, 26),
(27,  9, 'الزلفي',          'Az-Zulfi', 26.3000, 44.8000, 1, 27),
(28, 61, 'حفر الباطن',      'Hafar Al-Batin',28.4337,45.9601,1, 28),
(29, 65, 'الخفجي',          'Al-Khafji',28.4347, 48.4914, 1, 29),
(30, 40, 'العلا',           'Al-Ula',   26.6086, 37.9233, 1, 30) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(1,  1, 'العليا',          24.6915, 46.6859),
(2,  1, 'الملز',            24.6740, 46.7351),
(3,  1, 'النخيل',           24.7741, 46.6300),
(4,  1, 'الياسمين',         24.8412, 46.6442),
(5,  1, 'الورود',           24.7370, 46.6802),
(6,  1, 'حطين',             24.7706, 46.6193),
(7,  1, 'الملقا',           24.8011, 46.6500),
(8,  1, 'الروضة',           24.7167, 46.7333),
(9,  1, 'النرجس',           24.9000, 46.6500),
(10, 1, 'الربيع',           24.8167, 46.6833),
(11, 1, 'المروج',           24.7833, 46.6833),
(12, 1, 'العقيق',           24.7833, 46.6167),
(13, 1, 'السليمانية',       24.6833, 46.7000),
(14, 1, 'الصحافة',          24.7667, 46.6667),
(15, 1, 'القيروان',         24.8500, 46.5833),
(16, 1, 'العارض',           24.9333, 46.6500),
(17, 1, 'الشفا',            24.5500, 46.7167),
(18, 1, 'الدرعية الجديدة',  24.7167, 46.5833),
(19, 1, 'المعذر',           24.6833, 46.6667),
(20, 1, 'الصحافة الشمالية', 24.7833, 46.6500) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(21, 2, 'الروضة',           21.5810, 39.1690),
(22, 2, 'الزهراء',          21.5395, 39.1797),
(23, 2, 'الصفا',            21.5571, 39.1908),
(24, 2, 'الحمراء',          21.5169, 39.1857),
(25, 2, 'النعيم',           21.6167, 39.1500),
(26, 2, 'البساتين',         21.6000, 39.1500),
(27, 2, 'الفيصلية',         21.5167, 39.1833),
(28, 2, 'الشاطئ',           21.6833, 39.1167),
(29, 2, 'أبحر الشمالية',    21.7333, 39.0833),
(30, 2, 'أبحر الجنوبية',    21.6833, 39.1000),
(31, 2, 'البوادي',          21.5500, 39.2000),
(32, 2, 'النزهة',           21.5667, 39.1833),
(33, 2, 'السلامة',          21.5833, 39.1500),
(34, 2, 'المرجان',          21.6500, 39.1333),
(35, 2, 'الواحة',           21.5333, 39.2000) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(36, 3, 'العزيزية',         21.3973, 39.8856),
(37, 3, 'الششة',            21.3786, 39.8474),
(38, 3, 'العوالي',          21.3500, 39.8500),
(39, 3, 'النسيم',           21.4000, 39.8167),
(40, 3, 'الرصيفة',          21.3667, 39.8333),
(41, 3, 'الزاهر',           21.4333, 39.8167),
(42, 3, 'الكعكية',          21.4167, 39.8500),
(43, 3, 'العتيبية',         21.4333, 39.8333),
(44, 3, 'بطحاء قريش',       21.4167, 39.8333),
(45, 3, 'المسفلة',          21.4167, 39.8167) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(46, 4, 'قباء',             24.4639, 39.6181),
(47, 4, 'العوالي',          24.4500, 39.6167),
(48, 4, 'الحرة الشرقية',    24.5500, 39.6000),
(49, 4, 'الحرة الغربية',    24.4833, 39.5500),
(50, 4, 'السيح',            24.5333, 39.5500),
(51, 4, 'العزيزية',         24.5167, 39.5833),
(52, 4, 'الخالدية',         24.5333, 39.5667),
(53, 4, 'الدفاع',           24.4667, 39.5833),
(54, 4, 'بني خدرة',         24.4833, 39.6333),
(55, 4, 'الرانوناء',        24.4500, 39.5833) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(56, 5, 'الفيصلية',         26.4205, 50.0791),
(57, 5, 'النهضة',           26.3837, 50.0904),
(58, 5, 'الشاطئ',           26.4500, 50.1167),
(59, 5, 'الفردوس',          26.4333, 50.1000),
(60, 5, 'الجلوية',          26.4167, 50.1000),
(61, 5, 'الإسكان',          26.4500, 50.0833),
(62, 5, 'النور',            26.3833, 50.1167),
(63, 5, 'الأمانة',          26.4000, 50.0833),
(64, 5, 'الزهور',           26.4167, 50.0667),
(65, 5, 'البديع',           26.4500, 50.1000) ON CONFLICT DO NOTHING;
INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(66, 6, 'الراكة',           26.2954, 50.2231),
(67, 6, 'العقربية',         26.2667, 50.2000),
(68, 6, 'البحيرة',          26.2833, 50.2167),
(69, 6, 'الخبر الشمالية',   26.2833, 50.2000),
(70, 6, 'الخبر الجنوبية',   26.2000, 50.2000),
(71, 6, 'اليرموك',          26.2500, 50.1833),
(72, 6, 'الأمواج',          26.3000, 50.2167) ON CONFLICT DO NOTHING;
INSERT INTO categories (id, name_ar, name_en, slug, icon, color, sort_order) VALUES
(1,  'صيانة منزلية',                'Home maintenance',          'home-maintenance',  '🔧', '#3b82f6', 1),
(2,  'نظافة',                       'Cleaning',                  'cleaning',          '✨', '#10b981', 2),
(3,  'نقل وعفش',                    'Moving',                    'moving',            '🚚', '#f59e0b', 3),
(4,  'كهرباء',                      'Electrical',                'electrical',        '⚡', '#ef4444', 4),
(5,  'سباكة',                       'Plumbing',                  'plumbing',          '💧', '#06b6d4', 5),
(6,  'تكييف وتبريد',                'AC & cooling',              'ac-cooling',        '❄️', '#0ea5e9', 6),
(7,  'دهانات وديكور',               'Paint & décor',             'paint-decor',       '🎨', '#8b5cf6', 7),
(8,  'حدائق ومناظر',                'Gardens & landscaping',     'gardens',           '🌿', '#22c55e', 8),
(9,  'تعليم وتدريس',                'Tutoring',                  'education',         '📚', '#6366f1', 9),
(10, 'سيارات',                      'Cars',                      'cars',              '🚗', '#64748b', 10),
(11, 'تقنية وكمبيوتر',              'Tech & computers',          'tech',              '💻', '#0f172a', 11),
(12, 'مناسبات وضيافة',              'Events & catering',         'events',            '🎉', '#ec4899', 12),
(13, 'الأسر المنتجة',               'Home businesses',           'home-businesses',   '🍳', '#ec4899', 13),
(14, 'التصوير والإبداع',            'Photography & creative',    'photography',       '📸', '#6366f1', 14),
(15, 'التسويق الرقمي',              'Digital marketing',         'digital-marketing', '📱', '#06b6d4', 15),
(16, 'التوصيل والشحن',              'Delivery & shipping',       'delivery',          '📦', '#f59e0b', 16),
(17, 'العقار والإيجار',             'Real estate & rentals',     'real-estate',       '🏢', '#9c6a3d', 17),
(18, 'المقاولات والإنشاءات',        'Construction & contracting','construction',      '🏗️', '#d97706', 18),
(19, 'العناية الشخصية والتجميل',    'Personal care & beauty',    'personal-care',     '💇', '#f43f5e', 19),
(20, 'السفر والرحلات',              'Travel & tours',            'travel-tours',      '✈️', '#0ea5e9', 20),
(21, 'خدمات الأعمال',               'Business services',         'business-services', '💼', '#475569', 21),
(22, 'الصحة المنزلية والرعاية',     'Home health & care',        'home-health',       '🩺', '#dc2626', 22),
(23, 'التدريب والدورات',            'Training & courses',        'training',          '🏆', '#8b5cf6', 23),
(24, 'اللياقة والرياضة',            'Fitness & sports',          'fitness',           '💪', '#16a34a', 24),
(25, 'خدمات الطلاب',                'Student services',          'student-services',  '🎓', '#10b981', 25),
(26, 'الخياطة والتفصيل',            'Tailoring & sewing',        'tailoring',         '🧵', '#a855f7', 26),
(27, 'النقل والمواصلات',            'Transport & mobility',      'transport',         '🚐', '#eab308', 27) ON CONFLICT DO NOTHING;
INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order) VALUES

(1,  1,  'صيانة عامة',                  'General maintenance',      'general-maintenance',     1),
(2,  1,  'تركيب أثاث',                  'Furniture installation',   'furniture-installation',  2),
(3,  1,  'إصلاح أبواب ونوافذ',          'Door & window repair',     'doors-windows-repair',    3),
(4,  2,  'تنظيف منازل',                 'Home cleaning',            'home-cleaning',           1),
(5,  2,  'تنظيف خزانات',                'Water tank cleaning',      'tank-cleaning',           2),
(6,  2,  'تنظيف مكيفات',                'AC cleaning',              'ac-cleaning',             3),
(7,  2,  'مكافحة حشرات',                'Pest control',             'pest-control',            4),
(8,  3,  'نقل عفش داخل المدينة',        'Moving in city',           'moving-in-city',          1),
(9,  3,  'نقل عفش بين المدن',           'Moving between cities',    'moving-between-cities',   2),
(10, 3,  'فك وتركيب أثاث',              'Furniture assembly',       'assembly',                3),
(11, 4,  'إصلاح أعطال كهربائية',        'Electrical repair',        'electrical-repair',       1),
(12, 4,  'تمديدات كهربائية',            'Electrical wiring',        'electrical-wiring',       2),
(13, 5,  'إصلاح تسربات',                'Leak repair',              'leak-repair',             1),
(14, 5,  'تسليك مجاري',                 'Drain cleaning',           'drain-cleaning',          2),
(15, 6,  'صيانة مكيفات سبليت',          'Split AC service',         'split-ac-service',        1),
(16, 6,  'صيانة مكيفات مركزية',         'Central AC service',       'central-ac-service',      2),
(17, 7,  'دهان منازل',                  'Home painting',            'home-painting',           1),
(18, 7,  'ورق جدران',                   'Wallpaper',                'wallpaper',               2),
(19, 8,  'تنسيق حدائق',                 'Garden landscaping',       'garden-landscaping',      1),
(20, 9,  'تدريس خصوصي',                 'Private tutoring',         'private-tutoring',        1),
(21, 11, 'صيانة كمبيوتر',               'Computer repair',          'computer-repair',         1),
(22, 11, 'تصميم مواقع',                 'Web design',               'web-design',              2),
(23, 12, 'تنظيم حفلات',                 'Event planning',           'event-planning',          1),

(24, 1,  'تركيب ستائر',                 'Curtain installation',     'curtain-installation',    4),
(25, 2,  'غسيل سجاد',                   'Carpet cleaning',          'carpet-cleaning',         5),
(26, 4,  'تركيب إنارة',                 'Lighting installation',    'lighting-installation',   3),
(27, 5,  'تركيب سخانات',                'Heater installation',      'heater-installation',     3),
(28, 6,  'تركيب مكيفات',                'AC installation',          'ac-installation',         3),
(29, 7,  'ديكور جبس',                   'Gypsum decor',             'gypsum-decor',            3),
(30, 8,  'العناية بالعشب',              'Lawn care',                'lawn-care',               2),
(31, 9,  'تحفيظ قرآن',                  'Quran teaching',           'quran-teaching',          2),
(32, 9,  'تدريس لغات',                  'Language tutoring',        'language-tutoring',       3),
(33, 10, 'غسيل سيارات',                 'Car wash',                 'car-wash',                1),
(34, 10, 'تلميع سيارات',                'Car polishing',            'car-polish',              2),
(35, 10, 'تغيير زيت',                   'Oil change',               'oil-change',              3),
(36, 10, 'ميكانيكا متنقلة',             'Mobile mechanic',          'mobile-mechanic',         4),
(37, 11, 'دعم تقني',                    'Tech support',             'tech-support',            3),
(38, 11, 'تركيب شبكات',                 'Network installation',     'network-installation',    4),
(39, 11, 'تركيب كاميرات',               'Camera installation',      'camera-installation',     5),
(40, 11, 'تطوير تطبيقات',               'App development',          'app-development',         6),
(41, 12, 'كوش وأفراح',                  'Wedding stages',           'wedding-stage',           2),
(42, 12, 'تصوير مناسبات',               'Event photography',        'event-photography',       3),
(43, 12, 'تأجير كراسي وطاولات',         'Chair & table rental',     'chairs-tables-rental',    4),

(50, 13, 'طبخ منزلي',                   'Home cooking',             'home-cooking',            1),
(51, 13, 'قهوة وحلويات',                'Coffee & sweets',          'coffee-sweets',           2),
(52, 13, 'ذبائح وولائم',                'Catering meat & feasts',   'catering-meat',           3),
(53, 13, 'مأكولات شعبية',               'Traditional foods',        'traditional-foods',       4),
(54, 13, 'مخبوزات',                     'Bakery',                   'bakery',                  5),

(60, 14, 'تصوير منتجات',                'Product photography',      'product-photography',     1),
(61, 14, 'تصوير فيديو',                 'Video shooting',           'video-shooting',          2),
(62, 14, 'تصميم وطباعة',                'Design & printing',        'design-printing',         3),
(63, 14, 'مونتاج فيديو',                'Video editing',            'video-editing',           4),
(64, 14, 'تصوير جوي بدرون',             'Drone aerial shoots',      'drone-aerial',            5),

(70, 15, 'تسويق إلكتروني',              'Digital marketing',        'digital-marketing-svc',   1),
(71, 15, 'إدارة حسابات تواصل',          'Social media management',  'social-media-management', 2),
(72, 15, 'إعلانات ممولة',               'Paid ads',                 'paid-ads',                3),
(73, 15, 'تحسين محركات بحث',            'SEO',                      'seo',                     4),
(74, 15, 'تسويق مؤثرين',                'Influencer marketing',     'influencer-marketing',    5),

(80, 16, 'توصيل طلبات',                 'Parcel delivery',          'parcel-delivery',         1),
(81, 16, 'شحن داخلي',                   'Local shipping',           'local-shipping',          2),
(82, 16, 'شحن بين المدن',               'Intercity shipping',       'intercity-shipping',      3),
(83, 16, 'مندوب توصيل',                 'Delivery rep',             'delivery-rep',            4),

(90, 17, 'تأجير يومي',                  'Daily rental',             'daily-rental',            1),
(91, 17, 'شقق مفروشة',                  'Furnished apartments',     'furnished-apartments',    2),
(92, 17, 'شاليهات واستراحات',           'Chalets & resorts',        'chalets-resorts',         3),
(93, 17, 'إدارة عقارات',                'Property management',      'property-management',     4),

(100, 18, 'تشطيبات',                    'Finishing',                'finishing',               1),
(101, 18, 'نجارة',                      'Carpentry',                'carpentry',               2),
(102, 18, 'حدادة',                      'Welding',                  'welding',                 3),
(103, 18, 'جبس',                        'Gypsum work',              'gypsum-work',             4),
(104, 18, 'ترميمات',                    'Renovation',               'renovation',              5),

(110, 19, 'حلاقة',                      'Barbering',                'barbering',               1),
(111, 19, 'مكياج',                      'Makeup',                   'makeup',                  2),
(112, 19, 'عناية بالشعر',               'Hair care',                'hair-care',               3),
(113, 19, 'تجميل أظافر',                'Nail care',                'nail-care',               4),
(114, 19, 'سبا ومساج',                  'Spa & massage',            'spa-massage',             5),

(120, 20, 'تنظيم رحلات',                'Tour organisation',        'tour-organization',       1),
(121, 20, 'حجوزات فنادق',               'Hotel booking',            'hotel-booking',           2),
(122, 20, 'مرشد سياحي',                 'Tour guide',               'tour-guide',              3),
(123, 20, 'تأجير سيارات',               'Car rental',               'car-rental',              4),

(130, 21, 'استشارات إدارية',            'Management consulting',    'management-consulting',   1),
(131, 21, 'خدمات قانونية',              'Legal services',           'legal-services',          2),
(132, 21, 'خدمات محاسبية',              'Accounting',               'accounting',              3),
(133, 21, 'تأسيس شركات',                'Company formation',        'company-formation',       4),
(134, 21, 'دراسات جدوى',                'Feasibility studies',      'feasibility-studies',     5),

(140, 22, 'تمريض منزلي',                'Home nursing',             'home-nursing',            1),
(141, 22, 'رعاية كبار السن',            'Elderly care',             'elderly-care',            2),
(142, 22, 'جليسة أطفال',                'Babysitting',              'babysitting',             3),
(143, 22, 'علاج طبيعي',                 'Physical therapy',         'physical-therapy',        4),
(144, 22, 'تحاليل منزلية',              'Home lab tests',           'home-lab-tests',          5),

(150, 23, 'دورات احترافية',             'Professional courses',     'professional-courses',    1),
(151, 23, 'دورات لغة',                  'Language courses',         'language-courses',        2),
(152, 23, 'دورات تقنية',                'Tech courses',             'tech-courses',            3),
(153, 23, 'تدريب مهني',                 'Vocational training',      'vocational-training',     4),

(160, 24, 'تدريب شخصي',                 'Personal training',        'personal-training',       1),
(161, 24, 'تمارين جماعية',              'Group fitness',            'group-fitness',           2),
(162, 24, 'تدريب رياضي',                'Sports coaching',          'sports-coaching',         3),
(163, 24, 'تغذية وحمية',                'Nutrition & diet',         'nutrition-diet',          4),
(164, 24, 'يوغا وتأمل',                 'Yoga & meditation',        'yoga-meditation',         5),

(170, 25, 'كتابة بحوث',                 'Research writing',         'research-writing',        1),
(171, 25, 'ترجمة أكاديمية',             'Academic translation',     'academic-translation',    2),
(172, 25, 'تصميم عروض',                 'Presentation design',      'presentation-design',     3),
(173, 25, 'حل واجبات',                  'Homework help',            'homework-help',           4),

(180, 26, 'خياطة رجالية',               'Mens tailoring',           'mens-tailoring',          1),
(181, 26, 'خياطة نسائية',               'Womens tailoring',         'womens-tailoring',        2),
(182, 26, 'تعديل ملابس',                'Clothing alteration',      'clothing-alteration',     3),
(183, 26, 'خياطة ستائر',                'Curtain tailoring',        'curtain-tailoring',       4),

(190, 27, 'نقل ركاب',                   'Passenger transport',      'passenger-transport',     1),
(191, 27, 'تأجير حافلات',               'Bus rental',               'bus-rental',              2),
(192, 27, 'نقل مدرسي',                  'School transport',         'school-transport',        3) ON CONFLICT DO NOTHING;
INSERT INTO subscription_plans (id, name_ar, slug, description, price, duration_days, max_offers_per_month, is_featured, badge, features, sort_order) VALUES
(1, 'مجاني', 'free', 'الباقة المجانية للمبتدئين', 0.00, 30, 5, 0, NULL,
   jsonb_build_array('5 عروض شهرياً', 'ظهور عادي', 'دعم عبر البريد'), 1),
(2, 'مميز', 'premium', 'الباقة المميزة لزيادة الأعمال', 99.00, 30, 50, 1, 'مميز',
   jsonb_build_array('50 عرض شهرياً', 'إبراز في النتائج', 'شارة موثق', 'دعم سريع'), 2),
(3, 'احترافي', 'pro', 'الباقة الاحترافية للمحترفين', 199.00, 30, NULL, 1, 'احترافي',
   jsonb_build_array('عروض غير محدودة', 'ظهور في أعلى النتائج', 'شارة احترافي', 'إعلانات داخلية مجانية', 'دعم متميز 24/7'), 3) ON CONFLICT DO NOTHING;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('site_name', 'RIZA', 'string', 'general', 1, 'اسم الموقع'),
('site_description', 'منصة الخدمات المحلية', 'string', 'general', 1, 'وصف الموقع'),
('site_logo', '', 'string', 'general', 1, 'شعار الموقع'),
('site_email', 'info@example.com', 'string', 'general', 1, 'البريد العام'),
('site_phone', '', 'string', 'general', 1, 'هاتف التواصل'),
('default_language', 'ar', 'string', 'general', 1, 'اللغة الافتراضية'),
('default_currency', 'SAR', 'string', 'general', 1, 'العملة الافتراضية'),
('map_provider', 'osm', 'string', 'map', 1, 'مزود الخرائط osm|google'),
('default_lat', '24.7136', 'string', 'map', 1, 'خط العرض الافتراضي'),
('default_lng', '46.6753', 'string', 'map', 1, 'خط الطول الافتراضي'),
('search_radius_km', '25', 'number', 'general', 1, 'نصف قطر البحث بالكيلومتر'),
('allow_registration', 'true', 'boolean', 'auth', 1, 'السماح بالتسجيل'),
('require_email_verification', 'false', 'boolean', 'auth', 0, 'يتطلب توثيق البريد'),
('require_provider_verification', 'true', 'boolean', 'auth', 1, 'يتطلب توثيق مقدمي الخدمة'),
('max_offers_per_request', '20', 'number', 'requests', 0, 'حد أقصى للعروض'),
('commission_percent', '10', 'number', 'payments', 0, 'نسبة العمولة %'),
('maintenance_mode', 'false', 'boolean', 'general', 1, 'وضع الصيانة') ON CONFLICT DO NOTHING;
INSERT INTO ads (id, title, description, placement, is_active) VALUES
(1, 'مرحباً بك في منصة الخدمات', 'اطلب أي خدمة محلية بسهولة وسرعة', 'home_top', 1) ON CONFLICT DO NOTHING;
DO $ryza_sequences$
DECLARE r RECORD; sequence_next BIGINT; row_next BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name,
      pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema() AND c.column_default LIKE 'nextval(%'
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE', r.table_schema, r.table_name);
      EXECUTE format('SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM %s', r.seq) INTO sequence_next;
      EXECUTE format('SELECT COALESCE(MAX(%I),0) + 1 FROM %I.%I', r.column_name, r.table_schema, r.table_name) INTO row_next;
      PERFORM setval(r.seq, GREATEST(sequence_next, row_next), false);
    END IF;
  END LOOP;
END $ryza_sequences$;

-- migrations/001_add_offer_geolocation.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(10,2) DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('001_add_offer_geolocation.sql');

-- migrations/002_extend_categories_services.sql
UPDATE categories SET name_en = 'Home maintenance' WHERE slug = 'home-maintenance' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🔧' WHERE slug = 'home-maintenance' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Cleaning' WHERE slug = 'cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '✨' WHERE slug = 'cleaning' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Moving' WHERE slug = 'moving' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🚚' WHERE slug = 'moving' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Electrical' WHERE slug = 'electrical' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '⚡' WHERE slug = 'electrical' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Plumbing' WHERE slug = 'plumbing' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '💧' WHERE slug = 'plumbing' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'AC & cooling' WHERE slug = 'ac-cooling' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '❄️' WHERE slug = 'ac-cooling' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Paint & décor' WHERE slug = 'paint-decor' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🎨' WHERE slug = 'paint-decor' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Gardens & landscaping' WHERE slug = 'gardens' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🌿' WHERE slug = 'gardens' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Tutoring' WHERE slug = 'education' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '📚' WHERE slug = 'education' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Cars' WHERE slug = 'cars' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🚗' WHERE slug = 'cars' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Tech & computers' WHERE slug = 'tech' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '💻' WHERE slug = 'tech' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Events & catering' WHERE slug = 'events' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🎉' WHERE slug = 'events' AND (icon IS NULL OR trim(icon) = '');
INSERT INTO categories (id, name_ar, name_en, slug, icon, color, sort_order) VALUES
(13, 'الأسر المنتجة',               'Home businesses',           'home-businesses',   '🍳', '#ec4899', 13),
(14, 'التصوير والإبداع',            'Photography & creative',    'photography',       '📸', '#6366f1', 14),
(15, 'التسويق الرقمي',              'Digital marketing',         'digital-marketing', '📱', '#06b6d4', 15),
(16, 'التوصيل والشحن',              'Delivery & shipping',       'delivery',          '📦', '#f59e0b', 16),
(17, 'العقار والإيجار',             'Real estate & rentals',     'real-estate',       '🏢', '#9c6a3d', 17),
(18, 'المقاولات والإنشاءات',        'Construction & contracting','construction',      '🏗️', '#d97706', 18),
(19, 'العناية الشخصية والتجميل',    'Personal care & beauty',    'personal-care',     '💇', '#f43f5e', 19),
(20, 'السفر والرحلات',              'Travel & tours',            'travel-tours',      '✈️', '#0ea5e9', 20),
(21, 'خدمات الأعمال',               'Business services',         'business-services', '💼', '#475569', 21),
(22, 'الصحة المنزلية والرعاية',     'Home health & care',        'home-health',       '🩺', '#dc2626', 22),
(23, 'التدريب والدورات',            'Training & courses',        'training',          '🏆', '#8b5cf6', 23),
(24, 'اللياقة والرياضة',            'Fitness & sports',          'fitness',           '💪', '#16a34a', 24),
(25, 'خدمات الطلاب',                'Student services',          'student-services',  '🎓', '#10b981', 25),
(26, 'الخياطة والتفصيل',            'Tailoring & sewing',        'tailoring',         '🧵', '#a855f7', 26),
(27, 'النقل والمواصلات',            'Transport & mobility',      'transport',         '🚐', '#eab308', 27) ON CONFLICT DO NOTHING;
UPDATE services SET name_en = 'General maintenance' WHERE slug = 'general-maintenance' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Furniture installation' WHERE slug = 'furniture-installation' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Door & window repair' WHERE slug = 'doors-windows-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Home cleaning' WHERE slug = 'home-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Water tank cleaning' WHERE slug = 'tank-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'AC cleaning' WHERE slug = 'ac-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Pest control' WHERE slug = 'pest-control' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Moving in city' WHERE slug = 'moving-in-city' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Moving between cities' WHERE slug = 'moving-between-cities' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Furniture assembly' WHERE slug = 'assembly' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Electrical repair' WHERE slug = 'electrical-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Electrical wiring' WHERE slug = 'electrical-wiring' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Leak repair' WHERE slug = 'leak-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Drain cleaning' WHERE slug = 'drain-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Split AC service' WHERE slug = 'split-ac-service' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Central AC service' WHERE slug = 'central-ac-service' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Home painting' WHERE slug = 'home-painting' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Wallpaper' WHERE slug = 'wallpaper' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Garden landscaping' WHERE slug = 'garden-landscaping' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Private tutoring' WHERE slug = 'private-tutoring' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Computer repair' WHERE slug = 'computer-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Web design' WHERE slug = 'web-design' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Event planning' WHERE slug = 'event-planning' AND (name_en IS NULL OR trim(name_en) = '');
INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order) VALUES

(24, 1,  'تركيب ستائر',                 'Curtain installation',     'curtain-installation',    4),
(25, 2,  'غسيل سجاد',                   'Carpet cleaning',          'carpet-cleaning',         5),
(26, 4,  'تركيب إنارة',                 'Lighting installation',    'lighting-installation',   3),
(27, 5,  'تركيب سخانات',                'Heater installation',      'heater-installation',     3),
(28, 6,  'تركيب مكيفات',                'AC installation',          'ac-installation',         3),
(29, 7,  'ديكور جبس',                   'Gypsum decor',             'gypsum-decor',            3),
(30, 8,  'العناية بالعشب',              'Lawn care',                'lawn-care',               2),
(31, 9,  'تحفيظ قرآن',                  'Quran teaching',           'quran-teaching',          2),
(32, 9,  'تدريس لغات',                  'Language tutoring',        'language-tutoring',       3),
(33, 10, 'غسيل سيارات',                 'Car wash',                 'car-wash',                1),
(34, 10, 'تلميع سيارات',                'Car polishing',            'car-polish',              2),
(35, 10, 'تغيير زيت',                   'Oil change',               'oil-change',              3),
(36, 10, 'ميكانيكا متنقلة',             'Mobile mechanic',          'mobile-mechanic',         4),
(37, 11, 'دعم تقني',                    'Tech support',             'tech-support',            3),
(38, 11, 'تركيب شبكات',                 'Network installation',     'network-installation',    4),
(39, 11, 'تركيب كاميرات',               'Camera installation',      'camera-installation',     5),
(40, 11, 'تطوير تطبيقات',               'App development',          'app-development',         6),
(41, 12, 'كوش وأفراح',                  'Wedding stages',           'wedding-stage',           2),
(42, 12, 'تصوير مناسبات',               'Event photography',        'event-photography',       3),
(43, 12, 'تأجير كراسي وطاولات',         'Chair & table rental',     'chairs-tables-rental',    4),

(50, 13, 'طبخ منزلي',                   'Home cooking',             'home-cooking',            1),
(51, 13, 'قهوة وحلويات',                'Coffee & sweets',          'coffee-sweets',           2),
(52, 13, 'ذبائح وولائم',                'Catering meat & feasts',   'catering-meat',           3),
(53, 13, 'مأكولات شعبية',               'Traditional foods',        'traditional-foods',       4),
(54, 13, 'مخبوزات',                     'Bakery',                   'bakery',                  5),

(60, 14, 'تصوير منتجات',                'Product photography',      'product-photography',     1),
(61, 14, 'تصوير فيديو',                 'Video shooting',           'video-shooting',          2),
(62, 14, 'تصميم وطباعة',                'Design & printing',        'design-printing',         3),
(63, 14, 'مونتاج فيديو',                'Video editing',            'video-editing',           4),
(64, 14, 'تصوير جوي بدرون',             'Drone aerial shoots',      'drone-aerial',            5),

(70, 15, 'تسويق إلكتروني',              'Digital marketing',        'digital-marketing-svc',   1),
(71, 15, 'إدارة حسابات تواصل',          'Social media management',  'social-media-management', 2),
(72, 15, 'إعلانات ممولة',               'Paid ads',                 'paid-ads',                3),
(73, 15, 'تحسين محركات بحث',            'SEO',                      'seo',                     4),
(74, 15, 'تسويق مؤثرين',                'Influencer marketing',     'influencer-marketing',    5),

(80, 16, 'توصيل طلبات',                 'Parcel delivery',          'parcel-delivery',         1),
(81, 16, 'شحن داخلي',                   'Local shipping',           'local-shipping',          2),
(82, 16, 'شحن بين المدن',               'Intercity shipping',       'intercity-shipping',      3),
(83, 16, 'مندوب توصيل',                 'Delivery rep',             'delivery-rep',            4),

(90, 17, 'تأجير يومي',                  'Daily rental',             'daily-rental',            1),
(91, 17, 'شقق مفروشة',                  'Furnished apartments',     'furnished-apartments',    2),
(92, 17, 'شاليهات واستراحات',           'Chalets & resorts',        'chalets-resorts',         3),
(93, 17, 'إدارة عقارات',                'Property management',      'property-management',     4),

(100, 18, 'تشطيبات',                    'Finishing',                'finishing',               1),
(101, 18, 'نجارة',                      'Carpentry',                'carpentry',               2),
(102, 18, 'حدادة',                      'Welding',                  'welding',                 3),
(103, 18, 'جبس',                        'Gypsum work',              'gypsum-work',             4),
(104, 18, 'ترميمات',                    'Renovation',               'renovation',              5),

(110, 19, 'حلاقة',                      'Barbering',                'barbering',               1),
(111, 19, 'مكياج',                      'Makeup',                   'makeup',                  2),
(112, 19, 'عناية بالشعر',               'Hair care',                'hair-care',               3),
(113, 19, 'تجميل أظافر',                'Nail care',                'nail-care',               4),
(114, 19, 'سبا ومساج',                  'Spa & massage',            'spa-massage',             5),

(120, 20, 'تنظيم رحلات',                'Tour organisation',        'tour-organization',       1),
(121, 20, 'حجوزات فنادق',               'Hotel booking',            'hotel-booking',           2),
(122, 20, 'مرشد سياحي',                 'Tour guide',               'tour-guide',              3),
(123, 20, 'تأجير سيارات',               'Car rental',               'car-rental',              4),

(130, 21, 'استشارات إدارية',            'Management consulting',    'management-consulting',   1),
(131, 21, 'خدمات قانونية',              'Legal services',           'legal-services',          2),
(132, 21, 'خدمات محاسبية',              'Accounting',               'accounting',              3),
(133, 21, 'تأسيس شركات',                'Company formation',        'company-formation',       4),
(134, 21, 'دراسات جدوى',                'Feasibility studies',      'feasibility-studies',     5),

(140, 22, 'تمريض منزلي',                'Home nursing',             'home-nursing',            1),
(141, 22, 'رعاية كبار السن',            'Elderly care',             'elderly-care',            2),
(142, 22, 'جليسة أطفال',                'Babysitting',              'babysitting',             3),
(143, 22, 'علاج طبيعي',                 'Physical therapy',         'physical-therapy',        4),
(144, 22, 'تحاليل منزلية',              'Home lab tests',           'home-lab-tests',          5),

(150, 23, 'دورات احترافية',             'Professional courses',     'professional-courses',    1),
(151, 23, 'دورات لغة',                  'Language courses',         'language-courses',        2),
(152, 23, 'دورات تقنية',                'Tech courses',             'tech-courses',            3),
(153, 23, 'تدريب مهني',                 'Vocational training',      'vocational-training',     4),

(160, 24, 'تدريب شخصي',                 'Personal training',        'personal-training',       1),
(161, 24, 'تمارين جماعية',              'Group fitness',            'group-fitness',           2),
(162, 24, 'تدريب رياضي',                'Sports coaching',          'sports-coaching',         3),
(163, 24, 'تغذية وحمية',                'Nutrition & diet',         'nutrition-diet',          4),
(164, 24, 'يوغا وتأمل',                 'Yoga & meditation',        'yoga-meditation',         5),

(170, 25, 'كتابة بحوث',                 'Research writing',         'research-writing',        1),
(171, 25, 'ترجمة أكاديمية',             'Academic translation',     'academic-translation',    2),
(172, 25, 'تصميم عروض',                 'Presentation design',      'presentation-design',     3),
(173, 25, 'حل واجبات',                  'Homework help',            'homework-help',           4),

(180, 26, 'خياطة رجالية',               'Mens tailoring',           'mens-tailoring',          1),
(181, 26, 'خياطة نسائية',               'Womens tailoring',         'womens-tailoring',        2),
(182, 26, 'تعديل ملابس',                'Clothing alteration',      'clothing-alteration',     3),
(183, 26, 'خياطة ستائر',                'Curtain tailoring',        'curtain-tailoring',       4),

(190, 27, 'نقل ركاب',                   'Passenger transport',      'passenger-transport',     1),
(191, 27, 'تأجير حافلات',               'Bus rental',               'bus-rental',              2),
(192, 27, 'نقل مدرسي',                  'School transport',         'school-transport',        3) ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('002_extend_categories_services.sql');

-- migrations/003_communication_system.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accuracy_m INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
SELECT 1;
CREATE TABLE IF NOT EXISTS location_shares (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('client','provider','admin')) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m INT DEFAULT NULL,
  heading DECIMAL(5,2) DEFAULT NULL,
  speed_kmh DECIMAL(5,2) DEFAULT NULL,
  is_live SMALLINT DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS disputes (
  id SERIAL PRIMARY KEY,
  request_id INT DEFAULT NULL,
  conversation_id INT DEFAULT NULL,
  opened_by INT NOT NULL,
  assigned_admin_id INT DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('open','under_review','resolved','closed')) DEFAULT 'open',
  resolution TEXT DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS dispute_access_logs (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  admin_id INT NOT NULL,
  conversation_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP NULL DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  payload TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('active','expired','restored','deleted')) DEFAULT 'active',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('chat_archive_retention_days', '90', 'number', 'general', 0, 'مدة الاحتفاظ بأرشيف المحادثات بالأيام'),
('chat_archive_after_days',     '14', 'number', 'general', 0, 'بعد كم يوم من اكتمال الطلب يتم أرشفة المحادثة تلقائياً'),
('location_share_ttl_minutes',  '30', 'number', 'general', 0, 'مدة صلاحية مشاركة الموقع المباشرة بالدقائق'),
('chat_lock_after_completion',  'true', 'boolean', 'general', 0, 'قفل المحادثة بعد اكتمال الطلب') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('003_communication_system.sql');

-- migrations/004_two_way_reviews.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS review_type TEXT CHECK (review_type IN ('on_provider','on_requester')) DEFAULT 'on_provider',
  ADD COLUMN IF NOT EXISTS target_user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(5) DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS criteria_ratings JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
UPDATE reviews SET target_user_id = provider_id WHERE target_user_id IS NULL;
UPDATE reviews SET review_type = 'on_provider' WHERE review_type IS NULL;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_request$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE reviews ADD CONSTRAINT uq_review_request_type UNIQUE (request_id, reviewer_id, review_type)$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_user_id, review_type, is_visible);
CREATE TABLE IF NOT EXISTS review_translations (
  id BIGSERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  language VARCHAR(5) NOT NULL,
  translated_text TEXT NOT NULL,
  provider VARCHAR(40) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT uq_review_lang UNIQUE (review_id, language)
);
CREATE TABLE IF NOT EXISTS review_votes (
  id SERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  user_id INT NOT NULL,
  vote TEXT CHECK (vote IN ('helpful')) DEFAULT 'helpful',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_review_user_vote UNIQUE (review_id, user_id)
);
CREATE TABLE IF NOT EXISTS review_reports (
  id SERIAL PRIMARY KEY,
  review_id INT NOT NULL,
  reporter_id INT NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT DEFAULT NULL,
  status TEXT CHECK (status IN ('pending','reviewed','dismissed')) DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('review_auto_hide_reports', '3', 'number', 'general', 0, 'إخفاء تلقائي للتقييم عند بلوغ هذا العدد من البلاغات'),
('review_translation_provider', 'mymemory', 'string', 'general', 0, 'مزود الترجمة (mymemory | google | none)'),
('google_translate_api_key', '', 'string', 'general', 0, 'مفتاح Google Translate API (اختياري)') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('004_two_way_reviews.sql');

-- migrations/005_verification_and_integrations.sql
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
INSERT INTO schema_migrations(name) VALUES ('005_verification_and_integrations.sql');

-- migrations/006_dynamic_translations.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE services
  ADD COLUMN IF NOT EXISTS name_translations JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
UPDATE categories
SET name_translations = jsonb_build_object('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;
UPDATE services
SET name_translations = jsonb_build_object('ar', name_ar, 'en', name_en)
WHERE name_translations IS NULL;
INSERT INTO schema_migrations(name) VALUES ('006_dynamic_translations.sql');

-- migrations/007_provider_location_mode.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS location_mode TEXT CHECK (location_mode IN ('fixed','mobile')) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS fixed_latitude  DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_longitude DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_address   VARCHAR(255)  DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
UPDATE provider_profiles pp
SET fixed_latitude = u.latitude, fixed_longitude = u.longitude
FROM users u
WHERE pp.user_id = u.id AND pp.fixed_latitude IS NULL AND u.latitude IS NOT NULL;
INSERT INTO schema_migrations(name) VALUES ('007_provider_location_mode.sql');

-- migrations/008_dispute_workflow.sql
SELECT 1;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS frozen SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_locked SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratings_allowed TEXT CHECK (ratings_allowed IN ('both','client_only','provider_only','none','pending'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal'$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  kind TEXT CHECK (kind IN ('image','voice','file','screenshot')) DEFAULT 'file',
  caption VARCHAR(300) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS dispute_messages (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  author_id INT NOT NULL,
  author_role TEXT CHECK (author_role IN ('client','provider','admin')) NOT NULL,
  body TEXT NOT NULL,
  is_internal SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS dispute_status_logs (
  id BIGSERIAL PRIMARY KEY,
  dispute_id INT NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  changed_by INT NOT NULL,
  changed_role TEXT CHECK (changed_role IN ('client','provider','admin','system')) DEFAULT 'admin',
  note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO schema_migrations(name) VALUES ('008_dispute_workflow.sql');

-- migrations/009_reseed_catalog.sql
INSERT INTO categories (id, name_ar, name_en, slug, icon, color, sort_order, is_active)
VALUES
(1,  'صيانة منزلية',                'Home maintenance',          'home-maintenance',  '🔧', '#3b82f6', 1, 1),
(2,  'نظافة',                       'Cleaning',                  'cleaning',          '✨', '#10b981', 2, 1),
(3,  'نقل وعفش',                    'Moving',                    'moving',            '🚚', '#f59e0b', 3, 1),
(4,  'كهرباء',                      'Electrical',                'electrical',        '⚡', '#ef4444', 4, 1),
(5,  'سباكة',                       'Plumbing',                  'plumbing',          '💧', '#06b6d4', 5, 1),
(6,  'تكييف وتبريد',                'AC & cooling',              'ac-cooling',        '❄️', '#0ea5e9', 6, 1),
(7,  'دهانات وديكور',               'Paint & décor',             'paint-decor',       '🎨', '#8b5cf6', 7, 1),
(8,  'حدائق ومناظر',                'Gardens & landscaping',     'gardens',           '🌿', '#22c55e', 8, 1),
(9,  'تعليم وتدريس',                'Tutoring',                  'education',         '📚', '#6366f1', 9, 1),
(10, 'سيارات',                      'Cars',                      'cars',              '🚗', '#64748b', 10, 1),
(11, 'تقنية وكمبيوتر',              'Tech & computers',          'tech',              '💻', '#0f172a', 11, 1),
(12, 'مناسبات وضيافة',              'Events & catering',         'events',            '🎉', '#ec4899', 12, 1),
(13, 'الأسر المنتجة',               'Home businesses',           'home-businesses',   '🍳', '#ec4899', 13, 1),
(14, 'التصوير والإبداع',            'Photography & creative',    'photography',       '📸', '#6366f1', 14, 1),
(15, 'التسويق الرقمي',              'Digital marketing',         'digital-marketing', '📱', '#06b6d4', 15, 1),
(16, 'التوصيل والشحن',              'Delivery & shipping',       'delivery',          '📦', '#f59e0b', 16, 1),
(17, 'العقار والإيجار',             'Real estate & rentals',     'real-estate',       '🏢', '#9c6a3d', 17, 1),
(18, 'المقاولات والإنشاءات',        'Construction & contracting','construction',      '🏗️', '#d97706', 18, 1),
(19, 'العناية الشخصية والتجميل',    'Personal care & beauty',    'personal-care',     '💇', '#f43f5e', 19, 1),
(20, 'السفر والرحلات',              'Travel & tours',            'travel-tours',      '✈️', '#0ea5e9', 20, 1),
(21, 'خدمات الأعمال',               'Business services',         'business-services', '💼', '#475569', 21, 1),
(22, 'الصحة المنزلية والرعاية',     'Home health & care',        'home-health',       '🩺', '#dc2626', 22, 1),
(23, 'التدريب والدورات',            'Training & courses',        'training',          '🏆', '#8b5cf6', 23, 1),
(24, 'اللياقة والرياضة',            'Fitness & sports',          'fitness',           '💪', '#16a34a', 24, 1),
(25, 'خدمات الطلاب',                'Student services',          'student-services',  '🎓', '#10b981', 25, 1),
(26, 'الخياطة والتفصيل',            'Tailoring & sewing',        'tailoring',         '🧵', '#a855f7', 26, 1),
(27, 'النقل والمواصلات',            'Transport & mobility',      'transport',         '🚐', '#eab308', 27, 1)
ON CONFLICT DO NOTHING;
INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order, is_active)
VALUES
(1,   1,  'صيانة عامة',                 'General maintenance',      'general-maintenance',     1, 1),
(2,   1,  'تركيب أثاث',                 'Furniture installation',   'furniture-installation',  2, 1),
(3,   1,  'إصلاح أبواب ونوافذ',         'Door & window repair',     'doors-windows-repair',    3, 1),
(4,   2,  'تنظيف منازل',                'Home cleaning',            'home-cleaning',           1, 1),
(5,   2,  'تنظيف خزانات',               'Water tank cleaning',      'tank-cleaning',           2, 1),
(6,   2,  'تنظيف مكيفات',               'AC cleaning',              'ac-cleaning',             3, 1),
(7,   2,  'مكافحة حشرات',               'Pest control',             'pest-control',            4, 1),
(8,   3,  'نقل عفش داخل المدينة',       'Moving in city',           'moving-in-city',          1, 1),
(9,   3,  'نقل عفش بين المدن',          'Moving between cities',    'moving-between-cities',   2, 1),
(10,  3,  'فك وتركيب أثاث',             'Furniture assembly',       'assembly',                3, 1),
(11,  4,  'إصلاح أعطال كهربائية',       'Electrical repair',        'electrical-repair',       1, 1),
(12,  4,  'تمديدات كهربائية',           'Electrical wiring',        'electrical-wiring',       2, 1),
(13,  5,  'إصلاح تسربات',               'Leak repair',              'leak-repair',             1, 1),
(14,  5,  'تسليك مجاري',                'Drain cleaning',           'drain-cleaning',          2, 1),
(15,  6,  'صيانة مكيفات سبليت',         'Split AC service',         'split-ac-service',        1, 1),
(16,  6,  'صيانة مكيفات مركزية',        'Central AC service',       'central-ac-service',      2, 1),
(17,  7,  'دهان منازل',                 'Home painting',            'home-painting',           1, 1),
(18,  7,  'ورق جدران',                  'Wallpaper',                'wallpaper',               2, 1),
(19,  8,  'تنسيق حدائق',                'Garden landscaping',       'garden-landscaping',      1, 1),
(20,  9,  'تدريس خصوصي',                'Private tutoring',         'private-tutoring',        1, 1),
(21,  11, 'صيانة كمبيوتر',              'Computer repair',          'computer-repair',         1, 1),
(22,  11, 'تصميم مواقع',                'Web design',               'web-design',              2, 1),
(23,  12, 'تنظيم حفلات',                'Event planning',           'event-planning',          1, 1),
(50,  13, 'طبخ منزلي',                  'Home cooking',             'home-cooking',            1, 1),
(51,  13, 'قهوة وحلويات',               'Coffee & sweets',          'coffee-sweets',           2, 1),
(52,  13, 'ذبائح وولائم',               'Catering meat & feasts',   'catering-meat',           3, 1),
(53,  13, 'مأكولات شعبية',              'Traditional foods',        'traditional-foods',       4, 1),
(54,  13, 'مخبوزات',                    'Bakery',                   'bakery',                  5, 1),
(60,  14, 'تصوير منتجات',               'Product photography',      'product-photography',     1, 1),
(61,  14, 'تصوير فيديو',                'Video shooting',           'video-shooting',          2, 1),
(62,  14, 'تصميم وطباعة',               'Design & printing',        'design-printing',         3, 1),
(63,  14, 'مونتاج فيديو',               'Video editing',            'video-editing',           4, 1),
(70,  15, 'تسويق إلكتروني',             'Digital marketing',        'digital-marketing-svc',   1, 1),
(71,  15, 'إدارة حسابات تواصل',         'Social media management',  'social-media-management', 2, 1),
(72,  15, 'إعلانات ممولة',              'Paid ads',                 'paid-ads',                3, 1),
(80,  16, 'توصيل طلبات',                'Parcel delivery',          'parcel-delivery',         1, 1),
(81,  16, 'شحن داخلي',                  'Local shipping',           'local-shipping',          2, 1),
(82,  16, 'شحن بين المدن',              'Intercity shipping',       'intercity-shipping',      3, 1),
(90,  17, 'تأجير يومي',                 'Daily rental',             'daily-rental',            1, 1),
(91,  17, 'شقق مفروشة',                 'Furnished apartments',     'furnished-apartments',    2, 1),
(92,  17, 'شاليهات واستراحات',          'Chalets & resorts',        'chalets-resorts',         3, 1),
(100, 18, 'تشطيبات',                    'Finishing',                'finishing',               1, 1),
(101, 18, 'نجارة',                      'Carpentry',                'carpentry',               2, 1),
(102, 18, 'حدادة',                      'Welding',                  'welding',                 3, 1),
(110, 19, 'حلاقة',                      'Barbering',                'barbering',               1, 1),
(111, 19, 'مكياج',                      'Makeup',                   'makeup',                  2, 1),
(112, 19, 'عناية بالشعر',               'Hair care',                'hair-care',               3, 1),
(120, 20, 'تنظيم رحلات',                'Tour organisation',        'tour-organization',       1, 1),
(121, 20, 'حجوزات فنادق',               'Hotel booking',            'hotel-booking',           2, 1),
(122, 20, 'مرشد سياحي',                'Tour guide',               'tour-guide',              3, 1),
(123, 20, 'تأجير سيارات',               'Car rental',               'car-rental',              4, 1),
(130, 21, 'استشارات إدارية',            'Management consulting',    'management-consulting',   1, 1),
(131, 21, 'خدمات قانونية',              'Legal services',           'legal-services',          2, 1),
(132, 21, 'خدمات محاسبية',              'Accounting',               'accounting',              3, 1),
(140, 22, 'تمريض منزلي',                'Home nursing',             'home-nursing',            1, 1),
(141, 22, 'رعاية كبار السن',            'Elderly care',             'elderly-care',            2, 1),
(142, 22, 'جليسة أطفال',                'Babysitting',              'babysitting',             3, 1),
(150, 23, 'دورات احترافية',             'Professional courses',     'professional-courses',    1, 1),
(151, 23, 'دورات لغة',                  'Language courses',         'language-courses',        2, 1),
(160, 24, 'تدريب شخصي',                 'Personal training',        'personal-training',       1, 1),
(161, 24, 'تمارين جماعية',              'Group fitness',            'group-fitness',           2, 1),
(170, 25, 'كتابة بحوث',                 'Research writing',         'research-writing',        1, 1),
(171, 25, 'ترجمة أكاديمية',             'Academic translation',     'academic-translation',    2, 1),
(180, 26, 'خياطة رجالية',               'Mens tailoring',           'mens-tailoring',          1, 1),
(181, 26, 'خياطة نسائية',               'Womens tailoring',         'womens-tailoring',        2, 1),
(190, 27, 'نقل ركاب',                   'Passenger transport',      'passenger-transport',     1, 1),
(191, 27, 'تأجير حافلات',               'Bus rental',               'bus-rental',              2, 1)
ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('009_reseed_catalog.sql');

-- migrations/010_multi_identifier.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username    VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(120) DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username)$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD CONSTRAINT uq_users_facebook UNIQUE (facebook_id)$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('010_multi_identifier.sql');

-- migrations/011_auth_method_toggles.sql
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('auth_methods_enabled', 'username,email,phone,facebook', 'string', 'auth', 1,
 'طرق التسجيل/الدخول المسموحة (username,email,phone,facebook)') ON CONFLICT DO NOTHING;
UPDATE settings
   SET description = 'طرق التحقق المتاحة (sms,whatsapp,email,nafath,facebook)'
 WHERE setting_key = 'verify_methods_enabled';
INSERT INTO schema_migrations(name) VALUES ('011_auth_method_toggles.sql');

-- migrations/012_plan_search_priority.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS search_priority INT NOT NULL DEFAULT 0$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('012_plan_search_priority.sql');

-- migrations/013_provider_badges.sql
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
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS badge_trusted_active   SMALLINT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_trusted_until    TIMESTAMP    NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS badge_featured_active  SMALLINT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_featured_until   TIMESTAMP    NULL DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('badges_enabled',                       'true', 'boolean', 'auth', 1, 'تفعيل خدمة الشارات (موثوق / متميّز)'),
('badge_trusted_monthly_fee',            '49',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «موثوق» (ر.س)'),
('badge_trusted_insurance_required',     'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «موثوق»؟'),
('badge_trusted_insurance_amount',       '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «موثوق» (ر.س)'),
('badge_featured_monthly_fee',           '99',   'number',  'auth', 1, 'الرسوم الشهرية لشارة «متميّز» (ر.س)'),
('badge_featured_insurance_required',    'false','boolean', 'auth', 1, 'يشترط تأمين قابل للاسترداد لشارة «متميّز»؟'),
('badge_featured_insurance_amount',      '0',    'number',  'auth', 1, 'قيمة التأمين لشارة «متميّز» (ر.س)'),
('badge_duration_days',                  '30',   'number',  'auth', 1, 'مدة صلاحية الشارة بعد الدفع (أيام)') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('013_provider_badges.sql');

-- migrations/014_ads_media_type.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image','video')) NOT NULL DEFAULT 'image'$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('014_ads_media_type.sql');

-- migrations/015_ad_media_storage.sql
CREATE TABLE IF NOT EXISTS ad_media (
  id SERIAL PRIMARY KEY,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL,
  filename VARCHAR(200) DEFAULT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(name) VALUES ('015_ad_media_storage.sql');

-- migrations/016_user_ad_requests.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('requested','approved','awaiting_payment','active','rejected','expired','cancelled','paused'))
                    NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS placements JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_views INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD CONSTRAINT fk_ads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD CONSTRAINT fk_ads_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD CONSTRAINT fk_ads_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_user_requests_enabled', 'true', 'boolean', 'auth', 1, 'السماح للمستخدمين بطلب نشر إعلانات'),
('ads_price_per_day',          '5',   'number',  'auth', 1, 'سعر اليوم الواحد للإعلان (ر.س)'),
('ads_price_per_1k_views',     '10',  'number',  'auth', 1, 'سعر كل 1000 مشاهدة للإعلان (ر.س)'),
('ads_min_duration_days',      '1',   'number',  'auth', 1, 'الحد الأدنى لمدة الإعلان (أيام)'),
('ads_max_duration_days',      '90',  'number',  'auth', 1, 'الحد الأعلى لمدة الإعلان (أيام)'),
('ads_min_views',              '500', 'number',  'auth', 1, 'الحد الأدنى لعدد المشاهدات'),
('ads_max_views',              '100000','number','auth', 1, 'الحد الأعلى لعدد المشاهدات') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('016_user_ad_requests.sql');

-- migrations/017_more_ad_placements.sql
SELECT 1;
INSERT INTO schema_migrations(name) VALUES ('017_more_ad_placements.sql');

-- migrations/018_ad_daily_stats.sql
CREATE TABLE IF NOT EXISTS ad_stats_daily (
  id SERIAL PRIMARY KEY,
  ad_id INT NOT NULL,
  day DATE NOT NULL,
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ad_day UNIQUE (ad_id, day),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);
INSERT INTO schema_migrations(name) VALUES ('018_ad_daily_stats.sql');

-- migrations/019_ad_placement_pricing.sql
CREATE TABLE IF NOT EXISTS ad_placement_pricing (
  id SERIAL PRIMARY KEY,
  placement VARCHAR(40) NOT NULL UNIQUE,
  price_per_day DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  price_per_1k_views DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  exclusive_multiplier DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO ad_placement_pricing (placement, price_per_day, price_per_1k_views, exclusive_multiplier) VALUES
('home_top',                12, 18, 3.00),
('home_hero',               15, 20, 3.00),
('home_middle',              8, 12, 2.50),
('home_bottom',              6, 10, 2.00),
('services_top',             8, 12, 2.50),
('services_bottom',          5,  8, 2.00),
('category_top',             7, 10, 2.50),
('category_bottom',          4,  7, 2.00),
('request_details_top',      6,  9, 2.00),
('request_details_bottom',   4,  6, 2.00),
('sidebar',                  4,  6, 2.00),
('search',                   8, 12, 2.50),
('profile_top',              3,  5, 2.00),
('chat_sidebar',             3,  5, 2.00),
('footer',                   2,  3, 2.00) ON CONFLICT DO NOTHING;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS exclusive SMALLINT NOT NULL DEFAULT 0$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('019_ad_placement_pricing.sql');

-- migrations/020_ad_geo_targeting.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_countries JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_cities    JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE TABLE IF NOT EXISTS ip_geo_cache (
  ip          VARCHAR(64)  NOT NULL PRIMARY KEY,
  country     VARCHAR(8)   DEFAULT NULL,
  country_name VARCHAR(80) DEFAULT NULL,
  region      VARCHAR(120) DEFAULT NULL,
  city        VARCHAR(120) DEFAULT NULL,
  latitude    DECIMAL(10,6) DEFAULT NULL,
  longitude   DECIMAL(10,6) DEFAULT NULL,
  provider    VARCHAR(40)  DEFAULT NULL,
  resolved_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('ads_geo_provider', 'ip-api', 'string', 'auth', 0, 'مزود الكشف الجغرافي من IP (ip-api / disabled)'),
('ads_geo_cache_days', '14',  'number', 'auth', 0, 'مدة بقاء نتيجة الكشف الجغرافي في الكاش (أيام)') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('020_ad_geo_targeting.sql');

-- migrations/021_ad_region_targeting.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_regions JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ip_geo_cache ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('021_ad_region_targeting.sql');

-- migrations/022_user_region_governorate.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS region_id INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS governorate_id INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('022_user_region_governorate.sql');

-- migrations/023_countries_layer.sql
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
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE regions ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
UPDATE regions SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_region_country ON regions(country_id);
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS country_id INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE INDEX IF NOT EXISTS idx_user_country ON users(country_id);
UPDATE users SET country_id = (SELECT id FROM countries WHERE code = 'SA') WHERE country_id IS NULL AND region_id IS NOT NULL;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('default_country_code',         'SA',  'string',  'general', 1, 'الدولة الافتراضية التي تظهر أولاً في النموذج'),
('currency_follows_user_country','true','boolean', 'general', 1, 'العملة تتبع دولة المستخدم تلقائياً') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('023_countries_layer.sql');

-- migrations/024_backfill_governorate_cities.sql
INSERT INTO cities (governorate_id, name_ar, name_en,
                    latitude, longitude, is_active, sort_order)
SELECT g.id, g.name_ar, g.name_en,
       g.latitude, g.longitude, 1, COALESCE(g.sort_order, 0)
FROM governorates g
WHERE NOT EXISTS (
  SELECT 1 FROM cities c WHERE c.governorate_id = g.id
);
INSERT INTO schema_migrations(name) VALUES ('024_backfill_governorate_cities.sql');

-- migrations/025_terms_acceptance.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP NULL DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_version VARCHAR(20) DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('terms_version', '1.0', 'string', 'legal', 1, 'إصدار وثيقة الشروط الحالي'),
('terms_text',
'<h3>الشروط والأحكام — منصة ريزا</h3>

<p><b>١. قبول الاستخدام</b><br>
بتسجيلك في منصة ريزا فإنك توافق على هذه الشروط وتقر بأنك تجاوزت سن الرشد وفقاً للأنظمة المعمول بها في بلدك.</p>

<p><b>٢. صدق المعلومات</b><br>
تتعهد بأن جميع البيانات التي تقدمها (الاسم، الجوال، البريد، الموقع، الوثائق) صحيحة. أي معلومات مضللة قد تؤدي إلى تعليق حسابك فوراً.</p>

<p><b>٣. الخدمة والدفع</b><br>
المنصة وسيط بين العملاء ومقدمي الخدمة. تتفقون على تفاصيل العمل والسعر بشكل مباشر. تتحمل المنصة دور التحكيم عند النزاع وفق سجلات المحادثة والاتفاق.</p>

<p><b>٤. مراجعة المحادثات للاطمئنان على الجودة والمصداقية</b><br>
<u>تقر بعلمك وموافقتك</u> على أن إدارة المنصة قد تطّلع على المحادثات النصية والصوتية وسجلات مشاركة المواقع بينك وبين الطرف الآخر، وذلك حصراً في الحالات التالية:
</p>
<ul style="padding-inline-start:20px">
  <li>عند فتح نزاع أو شكوى من أحد الطرفين</li>
  <li>للتحقق من تنفيذ الاتفاق وحماية الحقوق</li>
  <li>للتأكد من عدم وجود محتوى مخالف للنظام أو الآداب العامة</li>
  <li>لضمان مصداقية مقدمي الخدمة الجدد قبل اعتمادهم</li>
</ul>
<p>كل عملية اطلاع تُسجَّل في نظام تدقيق داخلي مع وقتها وهوية الموظف، ولا تُستخدم لأي غرض تسويقي أو خارج هذه الحالات.</p>

<p><b>٥. حماية البيانات الشخصية</b><br>
لن تُشارك بياناتك مع أي طرف ثالث دون إذنك إلا بأمر قضائي. يحق لك طلب حذف حسابك وكل بياناتك في أي وقت.</p>

<p><b>٦. السلوك المقبول</b><br>
يُمنع منعاً باتاً: التحايل، الإهانة، نشر محتوى مسيء، طلب أو دفع مبالغ خارج المنصة، انتحال صفة شخص آخر. المخالفة تؤدي إلى إيقاف نهائي.</p>

<p><b>٧. تعديل الشروط</b><br>
يحق للمنصة تحديث هذه الوثيقة. عند أي تعديل جوهري سيُطلب منك القبول مرة أخرى عند تسجيل الدخول التالي.</p>

<p><b>٨. القانون المعمول به</b><br>
تخضع هذه الشروط لأنظمة المملكة العربية السعودية والدول الأعضاء حسب موقعك.</p>',
'text', 'legal', 1, 'نص الشروط والأحكام المعروض عند التسجيل') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(name) VALUES ('025_terms_acceptance.sql');

-- migrations/026_admin_permissions.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users'
      AND column_name = 'is_super_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_super_admin SMALLINT NOT NULL DEFAULT 0;
    UPDATE users SET is_super_admin = 1 WHERE role = 'admin';
  END IF;
END $$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('026_admin_permissions.sql');

-- migrations/027_postgres_perf_indexes.sql
DO $ryza_optional$ BEGIN
  EXECUTE $ryza_sql_0$CREATE EXTENSION IF NOT EXISTS postgis$ryza_sql_0$;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
  RAISE NOTICE 'Optional PostGIS extension unavailable';
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$ALTER TABLE users             ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$CREATE INDEX IF NOT EXISTS idx_users_geom              ON users USING GIST (geom)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$CREATE INDEX IF NOT EXISTS idx_provider_profiles_geom  ON provider_profiles USING GIST (geom)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$ALTER TABLE requests          ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
DO $ryza_optional$ BEGIN
  IF to_regtype('geography') IS NOT NULL THEN
    EXECUTE $ryza_sql_0$CREATE INDEX IF NOT EXISTS idx_requests_geom           ON requests USING GIST (geom)$ryza_sql_0$;
  END IF;
END $ryza_optional$;
CREATE INDEX IF NOT EXISTS idx_users_permissions       ON users USING GIN (permissions);
CREATE INDEX IF NOT EXISTS idx_countries_langs         ON countries USING GIN (languages_enabled);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_svc   ON provider_profiles USING GIN (service_ids);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_gal   ON provider_profiles USING GIN (gallery);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created   ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_request          ON offers (request_id);
CREATE INDEX IF NOT EXISTS idx_offers_provider         ON offers (provider_id);
CREATE INDEX IF NOT EXISTS idx_requests_status         ON requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_city           ON requests (city_id);
CREATE INDEX IF NOT EXISTS idx_users_role              ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_country           ON users (country_id);
CREATE INDEX IF NOT EXISTS idx_conv_part_user          ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_location_shares_live    ON location_shares (is_live, expires_at);
CREATE INDEX IF NOT EXISTS idx_disputes_status         ON disputes (status, opened_at);
INSERT INTO schema_migrations(name) VALUES ('027_postgres_perf_indexes.sql');

-- migrations/028_optional_email.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ALTER COLUMN email DROP NOT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('028_optional_email.sql');

-- migrations/029_durable_uploads.sql
CREATE TABLE IF NOT EXISTS uploaded_media (
  id UUID PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('requests','chat','reviews','avatars','disputes')),
  scope_id BIGINT DEFAULT NULL,
  filename VARCHAR(200) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL CHECK (size > 0 AND size <= 4194304),
  data BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (octet_length(data) = size)
);
CREATE INDEX IF NOT EXISTS uploaded_media_owner_idx ON uploaded_media(owner_id);
CREATE INDEX IF NOT EXISTS uploaded_media_scope_idx ON uploaded_media(scope, scope_id);
INSERT INTO schema_migrations(name) VALUES ('029_durable_uploads.sql');

-- migrations/030_ryza_launch.sql
UPDATE settings SET setting_value = 'RYZA' WHERE setting_key = 'site_name';
UPDATE settings SET setting_value = 'خدمات المنزل في القصيم والمجمعة' WHERE setting_key = 'site_description';
UPDATE settings SET setting_value = 'ar' WHERE setting_key = 'default_language';
UPDATE settings SET setting_value = '0' WHERE setting_key = 'commission_percent';
UPDATE settings SET setting_value = '26.3260' WHERE setting_key = 'default_lat';
UPDATE settings SET setting_value = '43.9750' WHERE setting_key = 'default_lng';
UPDATE settings SET setting_value = 'username,email,phone' WHERE setting_key = 'auth_methods_enabled';
UPDATE countries SET is_active = CASE WHEN code = 'SA' THEN 1 ELSE 0 END;
UPDATE regions SET is_active = CASE
  WHEN country_id = (SELECT id FROM countries WHERE code = 'SA') AND id IN (1,4) THEN 1 ELSE 0 END;
UPDATE governorates SET is_active = CASE
  WHEN region_id = 4 OR (region_id = 1 AND name_ar = 'المجمعة') THEN 1 ELSE 0 END;
UPDATE cities SET is_active = CASE
  WHEN governorate_id IN (SELECT id FROM governorates WHERE is_active = 1) THEN 1 ELSE 0 END;
UPDATE districts SET is_active = CASE
  WHEN city_id IN (SELECT id FROM cities WHERE is_active = 1) THEN 1 ELSE 0 END;
UPDATE categories SET is_active = CASE WHEN id IN (1,2,3,4,5,6,7,8) THEN 1 ELSE 0 END;
UPDATE services SET is_active = CASE
  WHEN category_id IN (SELECT id FROM categories WHERE is_active = 1) THEN 1 ELSE 0 END;
INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order, is_active)
VALUES (3001, 2, 'غسيل الأحواش', 'Yard cleaning', 'ryza-yard-cleaning', 4, 1)
ON CONFLICT (id) DO NOTHING;
UPDATE subscription_plans SET name_ar = 'تجربة مجانية', name_en = 'Free trial',
  description = 'تجربة الخدمة قبل تفعيل تحصيل الاشتراك', is_active = 1
  WHERE id = 1;
UPDATE subscription_plans SET name_ar = 'اشتراك العامل', name_en = 'Worker subscription',
  description = 'اشتراك العامل الشهري في RYZA', price = 40, duration_days = 30,
  max_offers_per_month = NULL, is_featured = 0, badge = NULL, search_priority = 0,
  features = '["استقبال الطلبات في منطقتك", "ملف مقدم الخدمة", "عروض أسعار للعملاء"]', is_active = 1
  WHERE id = 2;
UPDATE subscription_plans SET is_active = 0 WHERE id NOT IN (1,2);
INSERT INTO schema_migrations(name) VALUES ('030_ryza_launch.sql');

-- migrations/031_qassim_majmaah_districts.sql
LOCK TABLE cities, districts IN SHARE ROW EXCLUSIVE MODE;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE cities ADD COLUMN IF NOT EXISTS region_id INT REFERENCES regions(id) ON DELETE SET NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE INDEX IF NOT EXISTS idx_cities_region_id ON cities (region_id);
UPDATE cities c SET region_id = g.region_id FROM governorates g
WHERE c.governorate_id = g.id AND c.region_id IS NULL;
DO $$
DECLARE table_name TEXT; sequence_name TEXT; next_sequence_id BIGINT; next_row_id BIGINT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cities','districts'] LOOP
    sequence_name := pg_get_serial_sequence(table_name, 'id');
    EXECUTE format('SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM %s', sequence_name)
      INTO next_sequence_id;
    EXECUTE format('SELECT COALESCE(MAX(id),0) + 1 FROM %I', table_name) INTO next_row_id;
    PERFORM setval(sequence_name, GREATEST(next_row_id, next_sequence_id), false);
  END LOOP;
END $$;
CREATE TEMP TABLE ryza_district_city_import (
 source_city_id BIGINT PRIMARY KEY, region_id INT, governorate_id INT,
 name_ar TEXT, name_en TEXT, latitude DECIMAL(10,7), longitude DECIMAL(10,7)
) ON COMMIT DROP;
INSERT INTO ryza_district_city_import
(source_city_id,region_id,governorate_id,name_ar,name_en,latitude,longitude) VALUES
(24, 1, 5, 'المجمعة', 'Al Majma''ah', 25.90742996, 45.33901994),
(11, 4, 46, 'بريدة', 'Buraidah', 26.33033999, 43.97435997),
(80, 4, 47, 'عنيزة', 'Unayzah', 26.09155002, 43.98767004),
(955, 4, NULL, 'قبة', 'Qibah', 27.40646005, 44.33120001),
(1986, 4, 52, 'الأسياح', 'Al Asyah', 26.77779003, 44.21844994),
(1999, 4, 55, 'عيون الجواء', 'Uyun Al Jawa''', 26.49974004, 43.62932997),
(2421, 4, 48, 'الرس', 'Ar Rass', 25.87025999, 43.50747996),
(2448, 4, 49, 'المذنب', 'Al Midhnab', 25.86073, 44.22219004),
(2467, 4, 56, 'رياض الخبراء', 'Riyad Al Khabra', 26.03877996, 43.53903006),
(2481, 4, 51, 'البدائع', 'Al Badai''', 25.99835995, 43.72565998),
(2486, 4, NULL, 'الخبراء', 'Al Khabra''', 26.06003996, 43.63155004),
(2629, 4, NULL, 'الهلالية', 'Al Hilaliyah', 26.11904995, 43.69033004),
(2630, 4, 50, 'البكيرية', 'Al Bukayriyah', 26.14888995, 43.65727004),
(2777, 4, 54, 'الشماسية', 'Ash Shimasiyah', 26.32592999, 44.25512996),
(2988, 4, 58, 'عقلة الصقور', 'Uqlat As Suqur', 25.83349996, 42.20796997),
(3030, 4, 53, 'النبهانية', 'An Nabhaniyah', 25.87207999, 43.05837002),
(3151, 4, 57, 'ضرية', 'Dariyah', 24.71292004, 42.93423003),
(10872, 4, NULL, 'المرموثة', 'Al Marmuthah', 25.55005, 42.83408333);
INSERT INTO cities (governorate_id,region_id,name_ar,name_en,latitude,longitude,is_active,sort_order)
SELECT i.governorate_id,i.region_id,i.name_ar,i.name_en,i.latitude,i.longitude,
 CASE WHEN r.is_active = 1 AND (i.governorate_id IS NULL OR g.is_active = 1) THEN 1 ELSE 0 END,
 COALESCE(g.sort_order,100)
FROM ryza_district_city_import i
JOIN regions r ON r.id = i.region_id
LEFT JOIN governorates g ON g.id = i.governorate_id
WHERE NOT EXISTS (
 SELECT 1 FROM cities c WHERE c.region_id = i.region_id AND c.name_ar = i.name_ar
 AND c.governorate_id IS NOT DISTINCT FROM i.governorate_id
);
CREATE TEMP TABLE ryza_district_name_import (
 source_city_id BIGINT, name_ar TEXT, name_en TEXT
) ON COMMIT DROP;
INSERT INTO ryza_district_name_import (source_city_id,name_ar,name_en) VALUES
(24, 'المرقب', 'Al Marqab Dist.'),
(24, 'اليرموك', 'Al Yarmuk Dist.'),
(24, 'الفيحاء', 'Al Fayha Dist.'),
(24, 'الملك فهد', 'King Fahd Dist.'),
(24, 'الملك سلمان', 'King Salman Dist.'),
(24, 'الملك عبدالعزيز', 'King Abdulaziz Dist.'),
(24, 'الاندلس', 'Al Andalus Dist.'),
(24, 'المطار', 'Al Matar Dist.'),
(24, 'الملك عبدالله', 'King Abdullah Dist.'),
(24, 'المنطقة الصناعية', 'Industrial Area'),
(24, 'الجامعيين', 'Al Jamiyin Dist.'),
(24, 'المروج', 'Al Muruj Dist.'),
(24, 'المستقبل', 'Al Mustaqbal Dist.'),
(11, 'اليرموك', 'Al Yarmouk Dist.'),
(11, 'الرمال', 'Ar Rimal Dist.'),
(11, 'المروة', 'Al Marwah Dist.'),
(11, 'الخضر', 'Al Khudar Dist.'),
(11, 'اللسيب', 'Al Lusayb Dist.'),
(11, 'النور', 'Al Nur Dist.'),
(11, 'رواق', 'Rawaq Dist.'),
(11, 'القصيعة', 'Al Qusayah Dist.'),
(11, 'الغدير', 'Al Ghadir Dist.'),
(11, 'المروج', 'Al Muruj Dist.'),
(11, 'السالمية', 'As Salmiya Dist.'),
(11, 'الروابي', 'Al Rawabi Dist.'),
(11, 'حويلان', 'Huwailan Dist.'),
(11, 'الصباخ', 'As Sabbakh Dist.'),
(11, 'واسط', 'Wasit Dist.'),
(11, 'خضيراء', 'Khudayra Dist.'),
(11, 'السلام', 'As Salam Dist.'),
(11, 'الجنوب', 'Al Janub Dist.'),
(11, 'الخليج', 'Al Khalij Dist.'),
(11, 'الضاحي', 'Ad Dahi Dist.'),
(11, 'خب البريدي', 'Khub Al Buraydi Dist.'),
(11, 'السادة', 'As Sadah Dist.'),
(11, 'العريمضي', 'Al Uraymdi Dist.'),
(11, 'الهلال', 'Al Hilal Dist.'),
(11, 'العجيبة', 'Al Ujaybah Dist.'),
(11, 'البساتين', 'Al Basatin Dist.'),
(11, 'النسيم', 'Al Naseem Dist.'),
(11, 'الموطا', 'Al Mawta Dist.'),
(11, 'التعليم', 'At Taalim Dist.'),
(11, 'الجردة', 'Al Jardah Dist.'),
(11, 'الصالحية', 'As Salhiyah Dist.'),
(11, 'المريديسية', 'Al Muraydisiyyah Dist.'),
(11, 'الشروق', 'Al Shorouq Dist.'),
(11, 'خب الثنيان', 'Khub Ath Thanyan Dist.'),
(11, 'الشماس', 'Ash Shammas Dist.'),
(11, 'القادسية', 'Al Qadisiyah Dist.'),
(11, 'الصفا', 'As Safa Dist.'),
(11, 'الخبيب', 'Al Khabib Dist.'),
(11, 'المرقب', 'Al Marqab Dist.'),
(11, 'الربيع', 'Ar Rabie Dist.'),
(11, 'الرفيعة', 'Ar Rafiah Dist.'),
(11, 'الزرقاء', 'Az Zarqa Dist.'),
(11, 'الحمر', 'Al Humar Dist.'),
(11, 'الشفق', 'Ash Shafaq Dist.'),
(11, 'القاع البارد', 'Al Qaa Al Barid Dist.'),
(11, 'المنار', 'Al Manar Dist.'),
(11, 'الوسيطا', 'Al Wusayta Dist.'),
(11, 'الربوة', 'Ar Rabwah Dist.'),
(11, 'المنتزه', 'Al Muntazah Dist.'),
(11, 'الصفراء', 'As Safra Dist.'),
(11, 'النقع', 'An Naqa Dist.'),
(11, 'الفايزية', 'Al Fayziyah Dist.'),
(11, 'النخيل', 'Al Nakhil Dist.'),
(11, 'الروضه', 'Ar Rawdah Dist.'),
(11, 'النفل', 'An Nafl Dist.'),
(11, 'الإسكان', 'Al Iskan Dist.'),
(11, 'الأخضر', 'Al Akhdar Dist.'),
(11, 'الشقة', 'Ash Shiqah Dist.'),
(11, 'الرابية', 'Ar Rabiyah Dist.'),
(11, 'الريان', 'Ar Rayyan Dist.'),
(11, 'النهضة', 'An Nahdah Dist.'),
(11, 'الافق', 'Al Ufuq Dist.'),
(11, 'الورود', 'Al Wurud Dist.'),
(11, 'الخزامى', 'Al Khuzama Dist.'),
(11, 'الجزيرة', 'Al Jazirah Dist.'),
(11, 'الرحاب', 'Al Rehab Dist.'),
(11, 'الحزم', 'Al Hazm Dist.'),
(11, 'الفاروق', 'Al Farouq Dist.'),
(11, 'التشليح', 'At Tashlih Dist.'),
(80, 'حطين', 'Hiteen Dist.'),
(80, 'سنام', 'Snam Dist.'),
(80, 'الروضة', 'Ar Rawdah Dist.'),
(80, 'الدوحة', 'Ad Dawhah Dist.'),
(80, 'الحاجب', 'Al Hajeb Dist.'),
(80, 'الرمال', 'Ar Rimal Dist.'),
(80, 'الحفيرة', 'Al Hufayrah Dist.'),
(80, 'الصفا', 'As Safa Dist.'),
(80, 'الملك خالد', 'King Khalid Dist.'),
(80, 'الملك فهد', 'King Fahd Dist.'),
(80, 'الرياضى', 'Ar Riyadi Dist.'),
(80, 'القيروان', 'Al Qirawan Dist.'),
(80, 'غرناطة', 'Ghirnatah Dist.'),
(80, 'قرطبة', 'Qurtubah Dist.'),
(80, 'العقيق', 'Al Aqiq Dist.'),
(80, 'الشفاء', 'Ash Shifa Dist.'),
(80, 'المطار', 'Al Matar Dist.'),
(80, 'السليمانية', 'As Sulimaniyah Dist.'),
(80, 'الوسطى', 'Al Wusta Dist.'),
(80, 'المنطقة الصناعية الثانية', '2nd Industrial Area'),
(80, 'المنطقة الصناعية الاولى', '1st Industrial Area'),
(80, 'الخليج', 'Al Khalij Dist.'),
(80, 'المستودعات', 'Warehouse Dist.'),
(80, 'الهداء', 'Al Hadaa Dist.'),
(80, 'الصالحية', 'As Salhiyah Dist.'),
(80, 'المنتزة', 'Al Muntazah Dist.'),
(80, 'اليرموك', 'Al Yarmuk Dist.'),
(80, 'النسيم', 'Al Naseem Dist.'),
(80, 'الرحمانية', 'Ar Rahmaniyah Dist.'),
(80, 'دمشية', 'Damshiah Dist.'),
(80, 'المحمدية', 'Al Muhammadiyah Dist.'),
(80, 'العبسة', 'Al Absiah Dist.'),
(80, 'بدر', 'Badr Dist.'),
(80, 'الوهلان', 'Al Wahlan Dist.'),
(80, 'مليحة', 'Mlihah Dist.'),
(80, 'مربيدة', 'Marbidah Dist.'),
(80, 'العليا', 'Al Olaya Dist.'),
(80, 'وسط المدينة', 'City Center'),
(80, 'الريان', 'Ar Rayan Dist.'),
(80, 'الفاخرية', 'Al Fakhriyah Dist.'),
(80, 'النقيلية', 'An Nuqailiah Dist.'),
(80, 'السحيمية', 'As Suhaymiyyah Dist.'),
(80, 'البديعة', 'Al Badiah Dist.'),
(80, 'السلام', 'As Salam Dist.'),
(80, 'اشبيلية', 'Ishbiliyah Dist.'),
(80, 'العونية', 'Al Awniyah Dist.'),
(80, 'الحمراء', 'Al Hamra Dist.'),
(80, 'الفيحاء', 'Al Fayha Dist.'),
(80, 'الجامعي', 'Al Jamie Dist.'),
(80, 'المروج', 'Al Muruj Dist.'),
(80, 'اليمامة', 'Al Yamamah Dist.'),
(80, 'القادسية', 'Al Qadisiyah Dist.'),
(80, 'المنار', 'Al Manar Dist.'),
(80, 'الاشرفية', 'Al Ashrafiyah Dist.'),
(80, 'الخزامى', 'Al Khuzama Dist.'),
(80, 'الروغاني', 'Ar Rawghani Dist.'),
(80, 'الزهراء', 'Az Zahra Dist.'),
(80, 'الصفراء', 'As Safraa Dist.'),
(80, 'المباركية', 'Al Mubarkiah Dist.'),
(80, 'المدوية', 'Al Mudwiah Dist.'),
(80, 'النظيم', 'An Nadheem Dist.'),
(80, 'التحلية', 'At Tahliyah Dist.'),
(80, 'الجزيرة', 'Al Jazirah Dist.'),
(80, 'البستان', 'Al Bustan Dist.'),
(80, 'الوفاء', 'Al Wafa Dist.'),
(80, 'الزاهر', 'Az Zahir Dist.'),
(80, 'الواحة', 'Al Wahah Dist.'),
(80, 'سوق الماشية', 'Suq Al Mashiya Dist.'),
(80, 'الجلده', 'Al Jaldah Dist.'),
(80, 'الندى', 'An Nada Dist.'),
(80, 'ربوة الحاجب', 'Rabwat Al Hajeb Dist.'),
(80, 'الغضا', 'Al Kada Dist.'),
(80, 'الشعيب', 'Ash Shuaib Dist.'),
(80, 'البويطن', 'Al Buaiten Dist.'),
(80, 'النرجس', 'An Narjis Dist.'),
(80, 'عكاظ', 'Uqaz Dist.'),
(80, 'النفود', 'An Nofoad Dist.'),
(80, 'الوادي', 'Al Wadi Dist.'),
(80, 'القصور', 'Al Qusor Dist.'),
(80, 'الحديقة', 'Al Hadiqah Dist.'),
(80, 'المصيف', 'Al Masif Dist.'),
(80, 'الجوهرة', 'Al Jawharah Dist.'),
(80, 'الثقافة', 'Athaqafah Dist.'),
(80, 'المروة', 'Al Marwah Dist.'),
(80, 'الفخامة', 'Al Fakamah Dist.'),
(80, 'الفيصلية', 'Al Faisaliyah Dist.'),
(80, 'الزغيبة', 'Az Zugaibah Dist.'),
(80, 'الاسكان', 'Al Iskan Dist.'),
(80, 'الحزم', 'Al Hazm Dist.'),
(955, 'البساتين', 'Al Basatin Dist.'),
(955, 'المنتزة', 'Al Montazah Dist.'),
(955, 'الروضة', 'Al Rawdah Dist.'),
(955, 'الزهرة', 'Al Zahrah Dist.'),
(955, 'العليا', 'Al Olaya Dist.'),
(955, 'العزيزية', 'Al Aziziyah Dist.'),
(955, 'الازهار', 'Al Azhar Dist.'),
(955, 'النزهة', 'Al Nuzhah Dist.'),
(955, 'الجزيرة', 'Al Jazirah Dist.'),
(955, 'النهضة', 'Al Nahdah Dist.'),
(955, 'الاستراحات', 'Al Estrahat Dist.'),
(955, 'الربوة', 'Ar Rabwah Dist.'),
(1986, 'السلام', 'As Salam Dist.'),
(1986, 'خصيبة', 'Khusayyibah Dist.'),
(1986, 'البرود', 'Al Burud Dist.'),
(1986, 'الفهيد', 'Al Fuhaid Dist.'),
(1999, 'الخزان', 'Al Khazzan Dist.'),
(1999, 'المرقب', 'Al Marqab Dist.'),
(1999, 'التعليم', 'At Talim Dist.'),
(1999, 'الجردة', 'Al Jardah Dist.'),
(1999, 'النهضة', 'An Nahdah Dist.'),
(1999, 'النزهة', 'An Nuzhah Dist.'),
(1999, 'المنتزة', 'Al Montazah Dist.'),
(2421, 'اليرموك', 'Al Yarmuk Dist.'),
(2421, 'الروضة', 'Ar Rawdah Dist.'),
(2421, 'الملك عبدالعزيز', 'King Abdulaziz Dist.'),
(2421, 'الاحتفالات', 'Al Ihtifalat Dist.'),
(2421, 'الصناعية', 'As Sinaiyah Dist.'),
(2421, 'الملك فهد', 'King Fahd Dist.'),
(2421, 'الحزم', 'Al Hazm Dist.'),
(2421, 'التعليم', 'At Talim Dist.'),
(2421, 'الربوة', 'Ar Rabwah Dist.'),
(2421, 'القادسية', 'Al Qadisiyah Dist.'),
(2421, 'الشفاء', 'Ash Shifa Dist.'),
(2421, 'الجندل', 'Al Jandal Dist.'),
(2421, 'وادي الرمة', 'Wadi Ar Rimma Dist.'),
(2421, 'الملك فيصل', 'King Faisal Dist.'),
(2421, 'المطار', 'Al Matar Dist.'),
(2421, 'الزهرة', 'Az Zahrah Dist.'),
(2421, 'الملك خالد', 'King Khalid Dist.'),
(2421, 'السعادة', 'As Saadah Dist.'),
(2421, 'قصر بن عقيل', 'Qasr Ibn Aqil Dist.'),
(2421, 'الحوطة', 'Al Hutah Dist.'),
(2421, 'المدينة', 'Al Madinah Dist.'),
(2421, 'النخيل', 'Al Nakhil Dist.'),
(2421, 'الروابي', 'Ar Rawabi Dist.'),
(2421, 'الجريف', 'Al Juraif Dist.'),
(2421, 'الربيع', 'Ar Rabie Dist.'),
(2421, 'السلام', 'As Salam Dist.'),
(2421, 'المنار', 'Al Manar Dist.'),
(2421, 'بهجة', 'Bahjah Dist.'),
(2421, 'النهضة', 'An Nahdah Dist.'),
(2421, 'الشنانة الشمالية', 'Al Shinanah Ash Shamaliyyah Dist.'),
(2421, 'الحمراء', 'Al Hamra Dist.'),
(2421, 'الالغربي', 'Al Gharbi Dist.'),
(2421, 'الريان', 'Ar Rayyan  Dist.'),
(2421, 'الواحة', 'Al Wahah Dist.'),
(2421, 'سوق الماشيه الجديد', 'Suq Mashiya Al Jadid Dist.'),
(2421, 'الخليج', 'Al Khalij Dist.'),
(2421, 'المصيف', 'Al Masif Dist.'),
(2421, 'الاندلس', 'Al Andalus Dist.'),
(2421, 'المروج', 'Al Muruj Dist.'),
(2421, 'الورود', 'Al Wurud Dist.'),
(2421, 'الفيصلية', 'Al Faisaliyah Dist.'),
(2421, 'الشنانة الجنوبية', 'Al Shinanah Al Janubiyah Dist.'),
(2448, 'النخيل', 'Al Nakhil Dist.'),
(2448, 'الورود', 'Al Wurud Dist.'),
(2448, 'المنتزه', 'Al Muntazah Dist.'),
(2448, 'الصفراء', 'As Safra Dist.'),
(2448, 'البستان', 'Al Bustan Dist.'),
(2448, 'الجديدة', 'Al Jadidah Dist.'),
(2448, 'الخزامى', 'Al Khuzama Dist.'),
(2448, 'الخالدية', 'Al Khalidiyah Dist.'),
(2448, 'الروضة', 'Ar Rawdah Dist.'),
(2448, 'الحزم', 'Al Hazm Dist.'),
(2448, 'الصناعية', 'As Sinaiyah Dist.'),
(2448, 'قرطبة', 'Qurtubah Dist.'),
(2448, 'السلام', 'As Salam Dist.'),
(2448, 'القادسية', 'Al Qadisiyah Dist.'),
(2448, 'القفيفة', 'Al Qifayfah Dist.'),
(2448, 'ام عشيرة', 'Umm Ushayrah Dist.'),
(2448, 'الصالحية', 'As Salhiyah Dist.'),
(2467, 'الخزان', 'Al Khazzan Dist.'),
(2467, 'النزهة', 'An Nuzhah Dist.'),
(2467, 'القادسية', 'Al Qadisiyah Dist.'),
(2467, 'النهضة', 'An Nahdah Dist.'),
(2467, 'التعاون', 'At Taawun Dist.'),
(2467, 'الافراح', 'Al Afrah Dist.'),
(2467, 'القدس', 'Al Quds Dist.'),
(2467, 'الحزم', 'Al Hazm Dist.'),
(2467, 'زبيدة', 'Zubaiydah Dist.'),
(2467, 'النفل', 'An Nafl Dist.'),
(2481, 'ام ثلعة', 'Umm Thalaah Dist.'),
(2481, 'العبيلة', 'Al Ubaylah Dist.'),
(2481, 'العثمانية', 'Al Uthmaniyah Dist.'),
(2481, 'الوسطى', 'Al Wusta Dist.'),
(2481, 'الشيرمي', 'Ash Shayrami Dist.'),
(2481, 'المستشفى', 'Al Mustashfa Dist.'),
(2481, 'البساتين', 'Al Basatin Dist.'),
(2481, 'الاندلس', 'Al Andalus Dist.'),
(2481, 'النخيل', 'Al Nakhil Dist.'),
(2481, 'الرمة', 'Ar Rimmah Dist.'),
(2481, 'الصناعية', 'As Sinaiyah Dist.'),
(2481, 'الاصفر', 'Al Asfar Dist.'),
(2481, 'رامات', 'Ramat Dist.'),
(2481, 'العليا', 'Al Olaya Dist.'),
(2481, 'التعليم', 'At Taalim Dist.'),
(2481, 'السلام', 'As Salam Dist.'),
(2481, 'العبدلية', 'Al Abdaliyah Dist.'),
(2481, 'الدحلة', 'Ad Dahlah Dist.'),
(2486, 'السحابين الشمالي', 'As Sahabin Ash Shamali Dist.'),
(2486, 'الخبراء القديمة', 'Al Khabra Al Qadima Dist.'),
(2486, 'الياسمين', 'Al Yasmin Dist.'),
(2486, 'النسيم', 'Al Naseem Dist.'),
(2486, 'الورود', 'Al Wurud Dist.'),
(2486, 'الأندلس', 'Al Andalus Dist.'),
(2486, 'السحابين الجنوبي', 'As Sahabin Al Janubi Dist.'),
(2486, 'الربوة', 'Ar Rabwah Dist.'),
(2486, 'القدس', 'Al Quds Dist.'),
(2486, 'الملاح', 'Al Mallah Dist.'),
(2486, 'حى الرفيعة', 'Ar Rafiah Dist.'),
(2486, 'الريان', 'Ar Rayan Dist.'),
(2486, 'الروضة', 'Ar Rawdah Dist.'),
(2486, 'الربيع', 'Ar Rabie Dist.'),
(2486, 'الصناعية', 'As Sinaiyah Dist.'),
(2629, 'البيضاء', 'Al Baida Dist.'),
(2629, 'السلاح', 'As Silah Dist.'),
(2630, 'الزهرة', 'Az Zahrah Dist.'),
(2630, 'العزيزية', 'Al Aziziyah Dist.'),
(2630, 'الهلالية', 'Al Halaliyah Dist.'),
(2630, 'الخليج', 'Al Khalij Dist.'),
(2630, 'الملك عبدالله', 'King Abdullah Dist.'),
(2630, 'النهضة', 'An Nahdah Dist.'),
(2630, 'النخيل', 'Al Nakhil Dist.'),
(2630, 'الاسكان', 'Al Iskan Dist.'),
(2630, 'الخالدية', 'Al Khalidiyah Dist.'),
(2630, 'المحمدية', 'Al Muhammadiyah Dist.'),
(2630, 'القادسية', 'Al Qadisiyah Dist.'),
(2630, 'الصناعية', 'As Sinaiyah Dist.'),
(2630, 'الريان', 'Ar Rayyan Dist.'),
(2630, 'الامل', 'Al Amal Dist.'),
(2630, 'الرياض', 'Ar Riyadh Dist.'),
(2630, 'الديرة', 'Al Dirah Dist.'),
(2630, 'المجد', 'Al Majd Dist.'),
(2630, 'الربوة', 'Ar Rabwah Dist.'),
(2630, 'الحمراء', 'Al Hamra Dist.'),
(2630, 'الروابي', 'Ar Rawabi Dist.'),
(2630, 'التقنية', 'Al Taqniyah Dist.'),
(2630, 'المنتزة', 'Al Montazah Dist.'),
(2777, 'الخبيب', 'Al Khabib Dist.'),
(2777, 'المتحف', 'Al Mathaf Dist.'),
(2777, 'النخيل', 'Al Nakhil Dist.'),
(2777, 'الشفاء', 'Ash Shifa Dist.'),
(2777, 'الشماس', 'Al Shamas Dist.'),
(2777, 'البلاد', 'Al Bilad Dist.'),
(2777, 'الفاروق', 'Al Farouq Dist.'),
(2777, 'برزة', 'Barzah Dist.'),
(2777, 'الواسط', 'Al Wasit Dist.'),
(2777, 'البدع', 'Al Bada Dist.'),
(2777, 'الجال', 'Al Jal Dist.'),
(2777, 'الاندلس', 'Al Andalus Dist.'),
(2777, 'الميدان', 'Al Midan Dist.'),
(2777, 'السلام', 'As Salam Dist.'),
(2777, 'الصفاء', 'Al Safa Dist.'),
(2777, 'القادسية', 'Al Qadisiyah Dist.'),
(2777, 'الصناعية', 'As Sinaiyah Dist.'),
(2777, 'المتوكل', 'Al Mutawakil Dist.'),
(2988, 'العزيزية', 'Al Aziziyah Dist.'),
(2988, 'الاندلس', 'Al Andalus Dist.'),
(2988, 'المصيف', 'Al Masif Dist.'),
(2988, 'اليرموك', 'Al Yarmuk Dist.'),
(2988, 'الروضة', 'Ar Rawdah Dist.'),
(2988, 'الخليج', 'Al Khalij Dist.'),
(2988, 'الفيحاء', 'Al Fayha Dist.'),
(2988, 'الوادي', 'Al Wadi Dist.'),
(2988, 'الربوة', 'Ar Rabwah Dist.'),
(2988, 'المروج', 'Al Muruj Dist.'),
(2988, 'الملك فهد', 'King Fahd Dist.'),
(2988, 'الازدهار', 'Al Izdihar Dist.'),
(2988, 'القدس', 'Al Quds Dist.'),
(2988, 'السعادة', 'As Saadah Dist.'),
(2988, 'الشفاء', 'Ash Shifa Dist.'),
(2988, 'الياسمين', 'Al Yasmin Dist.'),
(2988, 'الملك عبدالله', 'King Abdullah Dist.'),
(2988, 'التعاون', 'At Taawun Dist.'),
(2988, 'السلام', 'As Salam Dist.'),
(2988, 'المنار', 'Al Manar Dist.'),
(2988, 'الريان', 'Ar Rayan Dist.'),
(2988, 'النهضة', 'An Nahdah Dist.'),
(3030, 'فيضة ابان الاحمر', 'Faidat Aban Alahmar'),
(3030, 'النويصفة', 'Al Nuwaisifah'),
(3030, 'مشرفة عمودان', 'Mishrifat Amudan'),
(3030, 'كفت', 'Kofat'),
(3151, 'الرابية', 'Ar Rabiyah Dist.'),
(3151, 'السلام', 'As Salam Dist.'),
(3151, 'النخيل', 'Al Nakhil Dist.'),
(3151, 'الربوة', 'Ar Rabwah Dist.'),
(3151, 'المنتزه', 'Al Muntazah Dist.'),
(3151, 'الجزيرة', 'Al Jazirah Dist.'),
(3151, 'الملك عبدالله', 'King Abdullah Dist.'),
(3151, 'غرناطة', 'Ghirnatah Dist.'),
(3151, 'ج1', 'C1 Dist.'),
(3151, 'المحمدية', 'Al Muhammadiyah Dist.'),
(3151, 'الريان', 'Ar Rayan Dist.'),
(3151, 'الرمثية', 'Ar Ramthyah Dist.'),
(3151, 'الغربية', 'Al Gharbiyyah Dist.'),
(3151, 'الصفا', 'As Safa Dist.'),
(3151, 'القادسية', 'Al Qadisiyah Dist.'),
(3151, 'حطين', 'Hiteen Dist.'),
(3151, 'الوادي', 'Al Wadi Dist.'),
(3151, 'اليرموك', 'Al Yarmuk Dist.'),
(10872, 'فيضة السلمات', 'Faidat Al Salamat'),
(10872, 'المرموثة الشمالية', 'Al Marmuthah Ash Shamaliyah'),
(10872, 'الخريشاء', 'Al Kharisha'),
(10872, 'المديري', 'Al Mudairy');
INSERT INTO districts (city_id,name_ar,name_en,is_active)
SELECT c.id,d.name_ar,d.name_en,c.is_active
FROM ryza_district_name_import d
JOIN ryza_district_city_import i ON i.source_city_id = d.source_city_id
JOIN cities c ON c.region_id = i.region_id AND c.name_ar = i.name_ar
 AND c.governorate_id IS NOT DISTINCT FROM i.governorate_id
WHERE NOT EXISTS (
 SELECT 1 FROM districts existing WHERE existing.city_id = c.id
 AND regexp_replace(trim(existing.name_ar), '^حي[[:space:]]+', '') = d.name_ar
);
INSERT INTO schema_migrations(name) VALUES ('031_qassim_majmaah_districts.sql');

-- migrations/032_restore_ad_workflow_columns.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL REFERENCES users(id) ON DELETE CASCADE$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('requested','approved','awaiting_payment','active','rejected','expired','cancelled','paused')) NOT NULL DEFAULT 'active'$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS placements JSONB DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS max_views INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) NOT NULL DEFAULT 0$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS payment_id INT DEFAULT NULL REFERENCES payments(id) ON DELETE SET NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP DEFAULT NULL$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
INSERT INTO schema_migrations(name) VALUES ('032_restore_ad_workflow_columns.sql');

-- migrations/033_auth_session_version.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key VARCHAR(64) PRIMARY KEY,
  total_hits INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset ON auth_rate_limits(reset_at);
INSERT INTO schema_migrations(name) VALUES ('033_auth_session_version.sql');

-- migrations/034_dispute_workflow_status.sql
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('open','under_review','waiting_response','escalated','resolved','rejected','closed'))$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('034_dispute_workflow_status.sql');

-- migrations/035_archive_and_ad_placements.sql
CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP DEFAULT NULL,
  last_message_at TIMESTAMP DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP DEFAULT NULL,
  payload TEXT DEFAULT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','restored','deleted'))
);
CREATE INDEX IF NOT EXISTS idx_archives_conv ON conversation_archives(conversation_id);
CREATE INDEX IF NOT EXISTS idx_archives_expires ON conversation_archives(expires_at, status);
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_placement_check$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
DO $ryza_duplicate$ BEGIN
  EXECUTE $ryza_sql_0$ALTER TABLE ads ADD CONSTRAINT ads_placement_check CHECK (placement IN (
  'home_top','home_hero','home_middle','home_bottom','services_top','services_bottom',
  'category_top','category_bottom','request_details_top','request_details_bottom',
  'sidebar','search','profile_top','chat_sidebar','footer'
))$ryza_sql_0$;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN NULL;
END $ryza_duplicate$;
INSERT INTO schema_migrations(name) VALUES ('035_archive_and_ad_placements.sql');

-- migrations/036_security_integrity.sql
DO $$
DECLARE rule RECORD;
BEGIN
  FOR rule IN SELECT * FROM (VALUES
    ('users','users_auth_version_nonnegative','CHECK (auth_version >= 0)'),
    ('users','users_super_admin_boolean','CHECK (is_super_admin IN (0,1))'),
    ('users','users_permissions_array','CHECK (permissions IS NULL OR jsonb_typeof(permissions) = ''array'')'),
    ('users','users_country_integrity','FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL'),
    ('users','users_region_integrity','FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL'),
    ('users','users_governorate_integrity','FOREIGN KEY (governorate_id) REFERENCES governorates(id) ON DELETE SET NULL'),
    ('regions','regions_country_integrity','FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL'),
    ('reviews','reviews_target_integrity','FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL'),
    ('auth_rate_limits','auth_rate_limits_hits_nonnegative','CHECK (total_hits >= 0)'),
    ('verification_otps','verification_otps_attempts_nonnegative','CHECK (attempts >= 0 AND max_attempts > 0)')
  ) AS rules(table_name, constraint_name, definition) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass(format('%I.%I', current_schema(), rule.table_name))
        AND conname = rule.constraint_name
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID',
        rule.table_name, rule.constraint_name, rule.definition);
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region_id);
CREATE INDEX IF NOT EXISTS idx_users_governorate ON users(governorate_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_media_created ON uploaded_media(created_at);
INSERT INTO schema_migrations(name) VALUES ('036_security_integrity.sql');

-- migrations/037_riza_rebrand.sql
UPDATE settings
SET setting_value = 'RIZA'
WHERE setting_key = 'site_name' AND setting_value = 'RYZA';
UPDATE subscription_plans
SET description = 'اشتراك العامل الشهري في RIZA'
WHERE id = 2 AND description = 'اشتراك العامل الشهري في RYZA';
UPDATE install_lock
SET site_name = 'RIZA'
WHERE site_name = 'RYZA';
INSERT INTO schema_migrations(name) VALUES ('037_riza_rebrand.sql');

-- migrations/038_provider_service_mode.sql
DO $$
DECLARE
  mode_column SMALLINT;
  old_constraint RECORD;
BEGIN
  SELECT attnum INTO STRICT mode_column
  FROM pg_attribute
  WHERE attrelid = 'provider_profiles'::regclass
    AND attname = 'location_mode' AND NOT attisdropped;

  -- Legacy installations may have renamed the generated column check.
  -- Remove only checks for this one column and retain unrelated constraints.
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'provider_profiles'::regclass
      AND contype = 'c' AND conkey = ARRAY[mode_column]
  LOOP
    EXECUTE format('ALTER TABLE provider_profiles DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;

  ALTER TABLE provider_profiles ADD CONSTRAINT provider_profiles_location_mode_check
    CHECK (location_mode IN ('fixed', 'mobile', 'both'));
  ALTER TABLE provider_profiles ALTER COLUMN location_mode SET DEFAULT 'mobile';
END $$;
INSERT INTO schema_migrations(name) VALUES ('038_provider_service_mode.sql');

-- migrations/039_awtad_rebrand.sql
UPDATE settings
SET setting_value = 'خدمات أوتاد'
WHERE setting_key = 'site_name' AND setting_value IN ('RIZA', 'RYZA');
UPDATE subscription_plans
SET description = 'اشتراك العامل الشهري في خدمات أوتاد'
WHERE id = 2 AND description IN ('اشتراك العامل الشهري في RIZA', 'اشتراك العامل الشهري في RYZA');
UPDATE install_lock
SET site_name = 'خدمات أوتاد'
WHERE site_name IN ('RIZA', 'RYZA');
INSERT INTO schema_migrations(name) VALUES ('039_awtad_rebrand.sql');

-- migrations/040_catalog_language_names.sql
WITH labels(slug, name_ar, name_en, ur, hi, bn) AS (
  VALUES
  ('home-maintenance', 'صيانة منزلية', 'Home maintenance', 'گھر کی دیکھ بھال', 'घर की मरम्मत', 'বাড়ির মেরামত'),
  ('cleaning', 'نظافة', 'Cleaning', 'صفائی', 'सफ़ाई', 'পরিষ্কার'),
  ('moving', 'نقل وعفش', 'Moving', 'سامان کی منتقلی', 'सामान की ढुलाई', 'মালামাল স্থানান্তর'),
  ('electrical', 'كهرباء', 'Electrical', 'بجلی کا کام', 'बिजली का काम', 'বিদ্যুতের কাজ'),
  ('plumbing', 'سباكة', 'Plumbing', 'پلمبنگ', 'प्लंबिंग', 'প্লাম্বিং'),
  ('ac-cooling', 'تكييف وتبريد', 'AC & cooling', 'ایئر کنڈیشننگ اور کولنگ', 'एसी और कूलिंग', 'এসি ও কুলিং'),
  ('paint-decor', 'دهانات وديكور', 'Paint & décor', 'رنگ و سجاوٹ', 'पेंट और सजावट', 'রং ও সাজসজ্জা'),
  ('gardens', 'حدائق ومناظر', 'Gardens & landscaping', 'باغات اور زمین کی آرائش', 'बाग़ और भूदृश्य', 'বাগান ও ল্যান্ডস্কেপ'),
  ('education', 'تعليم وتدريس', 'Tutoring', 'ٹیوشن', 'ट्यूशन', 'প্রাইভেট পড়ানো'),
  ('cars', 'سيارات', 'Cars', 'گاڑیوں کی خدمات', 'कार सेवाएँ', 'গাড়ির সেবা'),
  ('tech', 'تقنية وكمبيوتر', 'Tech & computers', 'ٹیکنالوجی اور کمپیوٹر', 'तकनीक और कंप्यूटर', 'প্রযুক্তি ও কম্পিউটার'),
  ('events', 'مناسبات وضيافة', 'Events & catering', 'تقریبات اور کھانے کا انتظام', 'कार्यक्रम और खानपान', 'অনুষ্ঠান ও খাবার সরবরাহ'),
  ('home-businesses', 'الأسر المنتجة', 'Home businesses', 'گھریلو کاروبار', 'घरेलू व्यवसाय', 'ঘরোয়া ব্যবসা'),
  ('photography', 'التصوير والإبداع', 'Photography & creative', 'فوٹوگرافی اور تخلیقی خدمات', 'फ़ोटोग्राफ़ी और रचनात्मक सेवाएँ', 'ফটোগ্রাফি ও সৃজনশীল সেবা'),
  ('digital-marketing', 'التسويق الرقمي', 'Digital marketing', 'ڈیجیٹل مارکیٹنگ', 'डिजिटल मार्केटिंग', 'ডিজিটাল মার্কেটিং'),
  ('delivery', 'التوصيل والشحن', 'Delivery & shipping', 'ڈیلیوری اور شپنگ', 'डिलीवरी और शिपिंग', 'ডেলিভারি ও শিপিং'),
  ('real-estate', 'العقار والإيجار', 'Real estate & rentals', 'جائیداد اور کرایہ', 'संपत्ति और किराये की सेवाएँ', 'সম্পত্তি ও ভাড়া'),
  ('construction', 'المقاولات والإنشاءات', 'Construction & contracting', 'تعمیرات اور ٹھیکیداری', 'निर्माण और ठेकेदारी', 'নির্মাণ ও ঠিকাদারি'),
  ('personal-care', 'العناية الشخصية والتجميل', 'Personal care & beauty', 'ذاتی نگہداشت اور خوبصورتی', 'व्यक्तिगत देखभाल और सौंदर्य', 'ব্যক্তিগত যত্ন ও সৌন্দর্য'),
  ('travel-tours', 'السفر والرحلات', 'Travel & tours', 'سفر اور سیاحت', 'यात्रा और पर्यटन', 'ভ্রমণ ও পর্যটন'),
  ('business-services', 'خدمات الأعمال', 'Business services', 'کاروباری خدمات', 'व्यावसायिक सेवाएँ', 'ব্যবসায়িক সেবা'),
  ('home-health', 'الصحة المنزلية والرعاية', 'Home health & care', 'گھر پر صحت اور نگہداشت', 'घर पर स्वास्थ्य और देखभाल', 'বাড়িতে স্বাস্থ্যসেবা ও যত্ন'),
  ('training', 'التدريب والدورات', 'Training & courses', 'تربیت اور کورسز', 'प्रशिक्षण और पाठ्यक्रम', 'প্রশিক্ষণ ও কোর্স'),
  ('fitness', 'اللياقة والرياضة', 'Fitness & sports', 'فٹنس اور کھیل', 'फ़िटनेस और खेल', 'ফিটনেস ও খেলাধুলা'),
  ('student-services', 'خدمات الطلاب', 'Student services', 'طلبہ کی خدمات', 'छात्र सेवाएँ', 'শিক্ষার্থীদের সেবা'),
  ('tailoring', 'الخياطة والتفصيل', 'Tailoring & sewing', 'سلائی اور درزی کی خدمات', 'सिलाई और दर्ज़ी सेवाएँ', 'সেলাই ও দর্জির সেবা'),
  ('transport', 'النقل والمواصلات', 'Transport & mobility', 'آمد و رفت', 'परिवहन', 'যাতায়াত')
)
UPDATE categories AS item
SET name_translations = COALESCE(item.name_translations::jsonb, '{}'::jsonb)
  || COALESCE((SELECT jsonb_object_agg(translation.lang, translation.label)
    FROM (VALUES ('ur', labels.ur), ('hi', labels.hi), ('bn', labels.bn))
      AS translation(lang, label)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> translation.lang), '') IS NULL
  ), '{}'::jsonb)
FROM labels
WHERE item.slug = labels.slug
  AND item.name_ar = labels.name_ar
  AND item.name_en = labels.name_en
  AND (item.name_translations IS NULL OR jsonb_typeof(item.name_translations::jsonb) = 'object')
  AND (item.name_translations::jsonb ->> 'ar' IS NULL OR item.name_translations::jsonb ->> 'ar' = labels.name_ar)
  AND (item.name_translations::jsonb ->> 'en' IS NULL OR item.name_translations::jsonb ->> 'en' = labels.name_en)
  AND EXISTS (
    SELECT 1 FROM (VALUES ('ur'), ('hi'), ('bn')) AS missing(lang)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> missing.lang), '') IS NULL
  );
WITH labels(slug, name_ar, name_en, ur, hi, bn) AS (
  VALUES
  ('general-maintenance', 'صيانة عامة', 'General maintenance', 'عام مرمت', 'सामान्य मरम्मत', 'সাধারণ মেরামত'),
  ('furniture-installation', 'تركيب أثاث', 'Furniture installation', 'فرنیچر کی تنصیب', 'फ़र्नीचर लगाना', 'আসবাবপত্র স্থাপন'),
  ('doors-windows-repair', 'إصلاح أبواب ونوافذ', 'Door & window repair', 'دروازوں اور کھڑکیوں کی مرمت', 'दरवाज़े और खिड़की की मरम्मत', 'দরজা ও জানালা মেরামত'),
  ('home-cleaning', 'تنظيف منازل', 'Home cleaning', 'گھر کی صفائی', 'घर की सफ़ाई', 'বাড়ি পরিষ্কার'),
  ('tank-cleaning', 'تنظيف خزانات', 'Water tank cleaning', 'پانی کی ٹینکی کی صفائی', 'पानी की टंकी की सफ़ाई', 'পানির ট্যাংক পরিষ্কার'),
  ('ac-cleaning', 'تنظيف مكيفات', 'AC cleaning', 'ایئر کنڈیشنر کی صفائی', 'एसी की सफ़ाई', 'এসি পরিষ্কার'),
  ('pest-control', 'مكافحة حشرات', 'Pest control', 'کیڑوں کا خاتمہ', 'कीट नियंत्रण', 'কীটপতঙ্গ নিয়ন্ত্রণ'),
  ('moving-in-city', 'نقل عفش داخل المدينة', 'Moving in city', 'شہر کے اندر سامان کی منتقلی', 'शहर के अंदर सामान की ढुलाई', 'শহরের মধ্যে মালামাল স্থানান্তর'),
  ('moving-between-cities', 'نقل عفش بين المدن', 'Moving between cities', 'شہروں کے درمیان سامان کی منتقلی', 'शहरों के बीच सामान की ढुलाई', 'শহরের মধ্যে দূরপাল্লার মালামাল স্থানান্তর'),
  ('assembly', 'فك وتركيب أثاث', 'Furniture assembly', 'فرنیچر کھولنا اور جوڑنا', 'फ़र्नीचर खोलना और जोड़ना', 'আসবাবপত্র খোলা ও জোড়া লাগানো'),
  ('electrical-repair', 'إصلاح أعطال كهربائية', 'Electrical repair', 'بجلی کی خرابیوں کی مرمت', 'बिजली की ख़राबी की मरम्मत', 'বৈদ্যুতিক ত্রুটি মেরামত'),
  ('electrical-wiring', 'تمديدات كهربائية', 'Electrical wiring', 'بجلی کی وائرنگ', 'बिजली की वायरिंग', 'বৈদ্যুতিক তার লাগানো'),
  ('leak-repair', 'إصلاح تسربات', 'Leak repair', 'پانی کے رساؤ کی مرمت', 'पानी के रिसाव की मरम्मत', 'পানির লিক মেরামত'),
  ('drain-cleaning', 'تسليك مجاري', 'Drain cleaning', 'نالی کی صفائی', 'नाली की सफ़ाई', 'নালা পরিষ্কার'),
  ('split-ac-service', 'صيانة مكيفات سبليت', 'Split AC service', 'اسپلٹ اے سی کی مرمت', 'स्प्लिट एसी की सर्विस', 'স্প্লিট এসি সার্ভিস'),
  ('central-ac-service', 'صيانة مكيفات مركزية', 'Central AC service', 'سنٹرل اے سی کی مرمت', 'सेंट्रल एसी की सर्विस', 'সেন্ট্রাল এসি সার্ভিস'),
  ('home-painting', 'دهان منازل', 'Home painting', 'گھر کی رنگائی', 'घर की पुताई', 'বাড়ির রং করা'),
  ('wallpaper', 'ورق جدران', 'Wallpaper', 'وال پیپر', 'वॉलपेपर', 'ওয়ালপেপার'),
  ('garden-landscaping', 'تنسيق حدائق', 'Garden landscaping', 'باغ کی آرائش', 'बाग़ का भूदृश्य', 'বাগান সাজানো'),
  ('private-tutoring', 'تدريس خصوصي', 'Private tutoring', 'نجی ٹیوشن', 'निजी ट्यूशन', 'প্রাইভেট পড়ানো'),
  ('computer-repair', 'صيانة كمبيوتر', 'Computer repair', 'کمپیوٹر کی مرمت', 'कंप्यूटर की मरम्मत', 'কম্পিউটার মেরামত'),
  ('web-design', 'تصميم مواقع', 'Web design', 'ویب سائٹ ڈیزائن', 'वेबसाइट डिज़ाइन', 'ওয়েবসাইট ডিজাইন'),
  ('event-planning', 'تنظيم حفلات', 'Event planning', 'تقریبات کی منصوبہ بندی', 'कार्यक्रम की योजना', 'অনুষ্ঠান আয়োজন'),
  ('curtain-installation', 'تركيب ستائر', 'Curtain installation', 'پردوں کی تنصیب', 'परदे लगाना', 'পর্দা লাগানো'),
  ('carpet-cleaning', 'غسيل سجاد', 'Carpet cleaning', 'قالین کی صفائی', 'कालीन की सफ़ाई', 'কার্পেট পরিষ্কার'),
  ('lighting-installation', 'تركيب إنارة', 'Lighting installation', 'روشنیوں کی تنصیب', 'बत्तियाँ लगाना', 'বাতি লাগানো'),
  ('heater-installation', 'تركيب سخانات', 'Heater installation', 'پانی کے ہیٹر کی تنصیب', 'पानी का हीटर लगाना', 'পানির হিটার লাগানো'),
  ('ac-installation', 'تركيب مكيفات', 'AC installation', 'ایئر کنڈیشنر کی تنصیب', 'एसी लगाना', 'এসি লাগানো'),
  ('gypsum-decor', 'ديكور جبس', 'Gypsum decor', 'جپسم کی سجاوٹ', 'जिप्सम की सजावट', 'জিপসামের সাজসজ্জা'),
  ('lawn-care', 'العناية بالعشب', 'Lawn care', 'لان کی دیکھ بھال', 'लॉन की देखभाल', 'লনের যত্ন'),
  ('quran-teaching', 'تحفيظ قرآن', 'Quran teaching', 'قرآن کی تعلیم', 'क़ुरआन की शिक्षा', 'কুরআন শিক্ষা'),
  ('language-tutoring', 'تدريس لغات', 'Language tutoring', 'زبانوں کی تعلیم', 'भाषाओं की शिक्षा', 'ভাষা শিক্ষা'),
  ('car-wash', 'غسيل سيارات', 'Car wash', 'گاڑی کی دھلائی', 'कार की धुलाई', 'গাড়ি ধোয়া'),
  ('car-polish', 'تلميع سيارات', 'Car polishing', 'گاڑی کی پالش', 'कार की पॉलिश', 'গাড়ি পালিশ'),
  ('oil-change', 'تغيير زيت', 'Oil change', 'انجن کا تیل تبدیل کرنا', 'इंजन का तेल बदलना', 'ইঞ্জিনের তেল বদলানো'),
  ('mobile-mechanic', 'ميكانيكا متنقلة', 'Mobile mechanic', 'موقع پر گاڑی کا مکینک', 'आपके पास आने वाला मैकेनिक', 'আপনার কাছে আসা মেকানিক'),
  ('tech-support', 'دعم تقني', 'Tech support', 'تکنیکی معاونت', 'तकनीकी सहायता', 'প্রযুক্তিগত সহায়তা'),
  ('network-installation', 'تركيب شبكات', 'Network installation', 'نیٹ ورک کی تنصیب', 'नेटवर्क लगाना', 'নেটওয়ার্ক স্থাপন'),
  ('camera-installation', 'تركيب كاميرات', 'Camera installation', 'کیمروں کی تنصیب', 'कैमरे लगाना', 'ক্যামেরা লাগানো'),
  ('app-development', 'تطوير تطبيقات', 'App development', 'ایپ کی تیاری', 'ऐप बनाना', 'অ্যাপ তৈরি'),
  ('wedding-stage', 'كوش وأفراح', 'Wedding stages', 'شادی کے اسٹیج کی سجاوٹ', 'शादी का मंच सजाना', 'বিয়ের মঞ্চ সাজানো'),
  ('event-photography', 'تصوير مناسبات', 'Event photography', 'تقریبات کی فوٹوگرافی', 'कार्यक्रम की फ़ोटोग्राफ़ी', 'অনুষ্ঠানের ফটোগ্রাফি'),
  ('chairs-tables-rental', 'تأجير كراسي وطاولات', 'Chair & table rental', 'کرسیوں اور میزوں کا کرایہ', 'कुर्सियाँ और मेज़ किराये पर देना', 'চেয়ার ও টেবিল ভাড়া'),
  ('home-cooking', 'طبخ منزلي', 'Home cooking', 'گھر کا کھانا', 'घर का खाना', 'ঘরোয়া রান্না'),
  ('coffee-sweets', 'قهوة وحلويات', 'Coffee & sweets', 'کافی اور مٹھائیاں', 'कॉफ़ी और मिठाइयाँ', 'কফি ও মিষ্টি'),
  ('catering-meat', 'ذبائح وولائم', 'Catering meat & feasts', 'گوشت اور دعوت کا انتظام', 'मांस और दावत का खानपान', 'মাংস ও ভোজের খাবার সরবরাহ'),
  ('traditional-foods', 'مأكولات شعبية', 'Traditional foods', 'روایتی کھانے', 'पारंपरिक भोजन', 'ঐতিহ্যবাহী খাবার'),
  ('bakery', 'مخبوزات', 'Bakery', 'بیکری', 'बेकरी', 'বেকারি'),
  ('product-photography', 'تصوير منتجات', 'Product photography', 'مصنوعات کی فوٹوگرافی', 'उत्पाद फ़ोटोग्राफ़ी', 'পণ্যের ফটোগ্রাফি'),
  ('video-shooting', 'تصوير فيديو', 'Video shooting', 'ویڈیو شوٹنگ', 'वीडियो शूटिंग', 'ভিডিও ধারণ'),
  ('design-printing', 'تصميم وطباعة', 'Design & printing', 'ڈیزائن اور طباعت', 'डिज़ाइन और प्रिंटिंग', 'ডিজাইন ও মুদ্রণ'),
  ('video-editing', 'مونتاج فيديو', 'Video editing', 'ویڈیو ایڈیٹنگ', 'वीडियो संपादन', 'ভিডিও সম্পাদনা'),
  ('drone-aerial', 'تصوير جوي بدرون', 'Drone aerial shoots', 'ڈرون سے فضائی عکس بندی', 'ड्रोन से हवाई फ़ोटोग्राफ़ी', 'ড্রোন দিয়ে আকাশ থেকে ছবি তোলা'),
  ('digital-marketing-svc', 'تسويق إلكتروني', 'Digital marketing', 'ڈیجیٹل مارکیٹنگ', 'डिजिटल मार्केटिंग', 'ডিজিটাল মার্কেটিং'),
  ('social-media-management', 'إدارة حسابات تواصل', 'Social media management', 'سوشل میڈیا اکاؤنٹس کا انتظام', 'सोशल मीडिया खाते प्रबंधन', 'সামাজিক মাধ্যম অ্যাকাউন্ট পরিচালনা'),
  ('paid-ads', 'إعلانات ممولة', 'Paid ads', 'معاوضے کے اشتہارات', 'सशुल्क विज्ञापन', 'অর্থপ্রদত্ত বিজ্ঞাপন'),
  ('seo', 'تحسين محركات بحث', 'SEO', 'سرچ انجن کی بہتری', 'खोज इंजन अनुकूलन', 'সার্চ ইঞ্জিন অপ্টিমাইজেশন'),
  ('influencer-marketing', 'تسويق مؤثرين', 'Influencer marketing', 'انفلوئنسر مارکیٹنگ', 'प्रभावशाली व्यक्तियों से प्रचार', 'ইনফ্লুয়েন্সার মার্কেটিং'),
  ('parcel-delivery', 'توصيل طلبات', 'Parcel delivery', 'پارسل کی ترسیل', 'पार्सल डिलीवरी', 'পার্সেল পৌঁছে দেওয়া'),
  ('local-shipping', 'شحن داخلي', 'Local shipping', 'ملک کے اندر شپنگ', 'देश के अंदर शिपिंग', 'দেশের মধ্যে শিপিং'),
  ('intercity-shipping', 'شحن بين المدن', 'Intercity shipping', 'شہروں کے درمیان شپنگ', 'शहरों के बीच शिपिंग', 'শহরের মধ্যে দূরপাল্লার শিপিং'),
  ('delivery-rep', 'مندوب توصيل', 'Delivery rep', 'ڈیلیوری کا نمائندہ', 'डिलीवरी प्रतिनिधि', 'ডেলিভারি প্রতিনিধি'),
  ('daily-rental', 'تأجير يومي', 'Daily rental', 'روزانہ کرایہ', 'दैनिक किराया', 'দৈনিক ভাড়া'),
  ('furnished-apartments', 'شقق مفروشة', 'Furnished apartments', 'فرنیچر والے اپارٹمنٹس', 'सुसज्जित अपार्टमेंट', 'সজ্জিত অ্যাপার্টমেন্ট'),
  ('chalets-resorts', 'شاليهات واستراحات', 'Chalets & resorts', 'شالے اور ریزورٹس', 'शैले और रिसॉर्ट', 'শালে ও রিসোর্ট'),
  ('property-management', 'إدارة عقارات', 'Property management', 'جائیداد کا انتظام', 'संपत्ति प्रबंधन', 'সম্পত্তি পরিচালনা'),
  ('finishing', 'تشطيبات', 'Finishing', 'تعمیر کے آخری کام', 'निर्माण का अंतिम काम', 'নির্মাণের শেষ পর্যায়ের কাজ'),
  ('carpentry', 'نجارة', 'Carpentry', 'بڑھئی کا کام', 'बढ़ई का काम', 'কাঠের কাজ'),
  ('welding', 'حدادة', 'Welding', 'ویلڈنگ', 'वेल्डिंग', 'ওয়েল্ডিং'),
  ('gypsum-work', 'جبس', 'Gypsum work', 'جپسم کا کام', 'जिप्सम का काम', 'জিপসামের কাজ'),
  ('renovation', 'ترميمات', 'Renovation', 'عمارت کی مرمت اور تجدید', 'भवन की मरम्मत और नवीनीकरण', 'ভবন মেরামত ও সংস্কার'),
  ('barbering', 'حلاقة', 'Barbering', 'حجامت', 'बाल काटना', 'চুল কাটা'),
  ('makeup', 'مكياج', 'Makeup', 'میک اپ', 'मेकअप', 'মেকআপ'),
  ('hair-care', 'عناية بالشعر', 'Hair care', 'بالوں کی دیکھ بھال', 'बालों की देखभाल', 'চুলের যত্ন'),
  ('nail-care', 'تجميل أظافر', 'Nail care', 'ناخنوں کی دیکھ بھال', 'नाख़ूनों की देखभाल', 'নখের যত্ন'),
  ('spa-massage', 'سبا ومساج', 'Spa & massage', 'اسپا اور مالش', 'स्पा और मालिश', 'স্পা ও ম্যাসাজ'),
  ('tour-organization', 'تنظيم رحلات', 'Tour organisation', 'سیاحتی دوروں کا انتظام', 'यात्रा आयोजन', 'ভ্রমণ আয়োজন'),
  ('hotel-booking', 'حجوزات فنادق', 'Hotel booking', 'ہوٹل کی بکنگ', 'होटल बुकिंग', 'হোটেল বুকিং'),
  ('tour-guide', 'مرشد سياحي', 'Tour guide', 'سیاحتی رہنما', 'पर्यटन गाइड', 'পর্যটন গাইড'),
  ('car-rental', 'تأجير سيارات', 'Car rental', 'گاڑی کرائے پر دینا', 'कार किराये पर लेना', 'গাড়ি ভাড়া'),
  ('management-consulting', 'استشارات إدارية', 'Management consulting', 'انتظامی مشاورت', 'प्रबंधन परामर्श', 'ব্যবস্থাপনা পরামর্শ'),
  ('legal-services', 'خدمات قانونية', 'Legal services', 'قانونی خدمات', 'कानूनी सेवाएँ', 'আইনি সেবা'),
  ('accounting', 'خدمات محاسبية', 'Accounting', 'حساب کتاب', 'लेखांकन', 'হিসাবরক্ষণ'),
  ('company-formation', 'تأسيس شركات', 'Company formation', 'کمپنی کی تشکیل', 'कंपनी की स्थापना', 'কোম্পানি প্রতিষ্ঠা'),
  ('feasibility-studies', 'دراسات جدوى', 'Feasibility studies', 'منصوبے کی عملی جانچ', 'परियोजना की व्यवहार्यता का अध्ययन', 'প্রকল্পের সম্ভাব্যতা যাচাই'),
  ('home-nursing', 'تمريض منزلي', 'Home nursing', 'گھر پر نرسنگ', 'घर पर नर्सिंग', 'বাড়িতে নার্সিং'),
  ('elderly-care', 'رعاية كبار السن', 'Elderly care', 'بزرگوں کی نگہداشت', 'बुज़ुर्गों की देखभाल', 'বয়স্কদের যত্ন'),
  ('babysitting', 'جليسة أطفال', 'Babysitting', 'بچوں کی دیکھ بھال', 'बच्चों की देखभाल', 'শিশুদের যত্ন'),
  ('physical-therapy', 'علاج طبيعي', 'Physical therapy', 'فزیوتھراپی', 'फ़िज़ियोथेरेपी', 'ফিজিওথেরাপি'),
  ('home-lab-tests', 'تحاليل منزلية', 'Home lab tests', 'گھر پر لیبارٹری ٹیسٹ', 'घर पर लैब जाँच', 'বাড়িতে ল্যাব পরীক্ষা'),
  ('professional-courses', 'دورات احترافية', 'Professional courses', 'پیشہ ورانہ کورسز', 'पेशेवर पाठ्यक्रम', 'পেশাগত কোর্স'),
  ('language-courses', 'دورات لغة', 'Language courses', 'زبان کے کورسز', 'भाषा पाठ्यक्रम', 'ভাষা কোর্স'),
  ('tech-courses', 'دورات تقنية', 'Tech courses', 'تکنیکی کورسز', 'तकनीकी पाठ्यक्रम', 'প্রযুক্তিগত কোর্স'),
  ('vocational-training', 'تدريب مهني', 'Vocational training', 'پیشہ ورانہ تربیت', 'व्यावसायिक प्रशिक्षण', 'পেশাগত প্রশিক্ষণ'),
  ('personal-training', 'تدريب شخصي', 'Personal training', 'ذاتی فٹنس تربیت', 'व्यक्तिगत फ़िटनेस प्रशिक्षण', 'ব্যক্তিগত ফিটনেস প্রশিক্ষণ'),
  ('group-fitness', 'تمارين جماعية', 'Group fitness', 'گروپ ورزش', 'समूह व्यायाम', 'দলগত ব্যায়াম'),
  ('sports-coaching', 'تدريب رياضي', 'Sports coaching', 'کھیلوں کی تربیت', 'खेल प्रशिक्षण', 'খেলাধুলার প্রশিক্ষণ'),
  ('nutrition-diet', 'تغذية وحمية', 'Nutrition & diet', 'غذائیت اور خوراک', 'पोषण और आहार', 'পুষ্টি ও খাদ্য'),
  ('yoga-meditation', 'يوغا وتأمل', 'Yoga & meditation', 'یوگا اور مراقبہ', 'योग और ध्यान', 'যোগ ও ধ্যান'),
  ('research-writing', 'كتابة بحوث', 'Research writing', 'تحقیقی تحریر', 'शोध लेखन', 'গবেষণা লেখা'),
  ('academic-translation', 'ترجمة أكاديمية', 'Academic translation', 'تعلیمی ترجمہ', 'शैक्षणिक अनुवाद', 'একাডেমিক অনুবাদ'),
  ('presentation-design', 'تصميم عروض', 'Presentation design', 'پریزنٹیشن کا ڈیزائن', 'प्रस्तुति डिज़ाइन', 'উপস্থাপনা ডিজাইন'),
  ('homework-help', 'حل واجبات', 'Homework help', 'ہوم ورک میں مدد', 'गृहकार्य में मदद', 'বাড়ির পড়ায় সাহায্য'),
  ('mens-tailoring', 'خياطة رجالية', 'Mens tailoring', 'مردانہ سلائی', 'पुरुषों की सिलाई', 'পুরুষদের পোশাক সেলাই'),
  ('womens-tailoring', 'خياطة نسائية', 'Womens tailoring', 'زنانہ سلائی', 'महिलाओं की सिलाई', 'নারীদের পোশাক সেলাই'),
  ('clothing-alteration', 'تعديل ملابس', 'Clothing alteration', 'کپڑوں کی ترمیم', 'कपड़ों में बदलाव', 'পোশাকের মাপ ঠিক করা'),
  ('curtain-tailoring', 'خياطة ستائر', 'Curtain tailoring', 'پردوں کی سلائی', 'परदों की सिलाई', 'পর্দা সেলাই'),
  ('passenger-transport', 'نقل ركاب', 'Passenger transport', 'مسافروں کی نقل و حمل', 'यात्री परिवहन', 'যাত্রী পরিবহন'),
  ('bus-rental', 'تأجير حافلات', 'Bus rental', 'بس کرایہ', 'बस किराया', 'বাস ভাড়া'),
  ('school-transport', 'نقل مدرسي', 'School transport', 'اسکول کی آمد و رفت', 'स्कूल परिवहन', 'স্কুলে যাতায়াত'),
  ('ryza-yard-cleaning', 'غسيل الأحواش', 'Yard cleaning', 'صحن کی صفائی', 'आँगन की सफ़ाई', 'উঠান পরিষ্কার')
)
UPDATE services AS item
SET name_translations = COALESCE(item.name_translations::jsonb, '{}'::jsonb)
  || COALESCE((SELECT jsonb_object_agg(translation.lang, translation.label)
    FROM (VALUES ('ur', labels.ur), ('hi', labels.hi), ('bn', labels.bn))
      AS translation(lang, label)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> translation.lang), '') IS NULL
  ), '{}'::jsonb)
FROM labels
WHERE item.slug = labels.slug
  AND item.name_ar = labels.name_ar
  AND item.name_en = labels.name_en
  AND (item.name_translations IS NULL OR jsonb_typeof(item.name_translations::jsonb) = 'object')
  AND (item.name_translations::jsonb ->> 'ar' IS NULL OR item.name_translations::jsonb ->> 'ar' = labels.name_ar)
  AND (item.name_translations::jsonb ->> 'en' IS NULL OR item.name_translations::jsonb ->> 'en' = labels.name_en)
  AND EXISTS (
    SELECT 1 FROM (VALUES ('ur'), ('hi'), ('bn')) AS missing(lang)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> missing.lang), '') IS NULL
  );
INSERT INTO schema_migrations(name) VALUES ('040_catalog_language_names.sql');

-- updated_at triggers and monotonic sequence synchronization.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;
DO $$
DECLARE r RECORD; sequence_next BIGINT; row_next BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.table_schema = current_schema() AND c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      'trg_' || r.table_name || '_updated_at', r.table_schema, r.table_name);
  END LOOP;
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name,
      pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema() AND c.column_default LIKE 'nextval(%'
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE', r.table_schema, r.table_name);
      EXECUTE format('SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM %s', r.seq) INTO sequence_next;
      EXECUTE format('SELECT COALESCE(MAX(%I),0) + 1 FROM %I.%I', r.column_name, r.table_schema, r.table_name) INTO row_next;
      PERFORM setval(r.seq, GREATEST(sequence_next, row_next), false);
    END IF;
  END LOOP;
END $$;
COMMIT;
