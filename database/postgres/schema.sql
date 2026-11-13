-- Auto-generated from database/schema.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

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
