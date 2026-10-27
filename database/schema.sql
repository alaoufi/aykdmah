-- =====================================================
-- Local Services Marketplace - Database Schema
-- MySQL 8.0+ / utf8mb4_unicode_ci
-- =====================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------
-- Roles
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Geographic hierarchy: Region → Governorate → City → District
-- (التقسيم الإداري للمملكة العربية السعودية)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) DEFAULT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  capital_ar VARCHAR(120) DEFAULT NULL,
  capital_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_regions_name (name_ar),
  INDEX idx_regions_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS governorates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_capital TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_gov_region_name (region_id, name_ar),
  INDEX idx_gov_region (region_id),
  INDEX idx_gov_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  governorate_id INT DEFAULT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (governorate_id) REFERENCES governorates(id) ON DELETE SET NULL,
  INDEX idx_cities_active (is_active),
  INDEX idx_cities_governorate (governorate_id),
  INDEX idx_cities_name (name_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  INDEX idx_districts_city (city_id),
  INDEX idx_districts_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Categories & Services
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) DEFAULT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  icon VARCHAR(255) DEFAULT NULL,
  color VARCHAR(20) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_categories_active (is_active),
  INDEX idx_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) DEFAULT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  icon VARCHAR(255) DEFAULT NULL,
  base_price DECIMAL(10,2) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  is_urgent_supported TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  INDEX idx_services_category (category_id),
  INDEX idx_services_active (is_active),
  INDEX idx_services_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Users
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','provider','client') NOT NULL DEFAULT 'client',
  avatar VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  is_blocked TINYINT(1) DEFAULT 0,
  is_verified TINYINT(1) DEFAULT 0,
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  phone_verified_at TIMESTAMP NULL DEFAULT NULL,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  last_seen_at TIMESTAMP NULL DEFAULT NULL,
  is_online TINYINT(1) DEFAULT 0,
  city_id INT DEFAULT NULL,
  district_id INT DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email),
  INDEX idx_users_phone (phone),
  INDEX idx_users_city (city_id),
  INDEX idx_users_blocked (is_blocked),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  bio TEXT DEFAULT NULL,
  birth_date DATE DEFAULT NULL,
  gender ENUM('male','female','other') DEFAULT NULL,
  address TEXT DEFAULT NULL,
  preferences JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  business_name VARCHAR(200) DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  experience_years INT DEFAULT 0,
  category_id INT DEFAULT NULL,
  service_ids JSON DEFAULT NULL,
  service_radius_km INT DEFAULT 25,
  hourly_rate DECIMAL(10,2) DEFAULT NULL,
  cover_image VARCHAR(255) DEFAULT NULL,
  gallery JSON DEFAULT NULL,
  verification_status ENUM('pending','verified','rejected','none') DEFAULT 'none',
  verified_at TIMESTAMP NULL DEFAULT NULL,
  rating_avg DECIMAL(3,2) DEFAULT 0.00,
  rating_count INT DEFAULT 0,
  completed_orders INT DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0.00,
  is_featured TINYINT(1) DEFAULT 0,
  featured_until TIMESTAMP NULL DEFAULT NULL,
  current_subscription_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_provider_category (category_id),
  INDEX idx_provider_rating (rating_avg),
  INDEX idx_provider_featured (is_featured),
  INDEX idx_provider_verified (verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Verification Requests
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  document_type ENUM('national_id','commercial_register','license','other') NOT NULL,
  document_url VARCHAR(255) NOT NULL,
  notes TEXT DEFAULT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_verification_status (status),
  INDEX idx_verification_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Requests (طلبات الخدمة)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  preferred_date DATETIME DEFAULT NULL,
  is_urgent TINYINT(1) DEFAULT 0,
  status ENUM('open','assigned','in_progress','completed','cancelled','closed') NOT NULL DEFAULT 'open',
  assigned_provider_id INT DEFAULT NULL,
  accepted_offer_id INT DEFAULT NULL,
  views_count INT DEFAULT 0,
  offers_count INT DEFAULT 0,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  cancellation_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_provider_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_requests_client (client_id),
  INDEX idx_requests_status (status),
  INDEX idx_requests_category (category_id),
  INDEX idx_requests_service (service_id),
  INDEX idx_requests_city (city_id),
  INDEX idx_requests_urgent (is_urgent),
  INDEX idx_requests_created (created_at),
  INDEX idx_requests_location (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  INDEX idx_request_files_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Offers (عروض مقدمي الخدمة)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  provider_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  message TEXT DEFAULT NULL,
  estimated_duration VARCHAR(100) DEFAULT NULL,
  available_from DATETIME DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  location_accuracy DECIMAL(10,2) DEFAULT NULL,
  status ENUM('pending','accepted','rejected','withdrawn') DEFAULT 'pending',
  accepted_at TIMESTAMP NULL DEFAULT NULL,
  rejected_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_offer_provider_request (request_id, provider_id),
  INDEX idx_offers_request (request_id),
  INDEX idx_offers_provider (provider_id),
  INDEX idx_offers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Conversations & Messages
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT DEFAULT NULL,
  title VARCHAR(200) DEFAULT NULL,
  last_message_id INT DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  INDEX idx_conv_request (request_id),
  INDEX idx_conv_last (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_read_at TIMESTAMP NULL DEFAULT NULL,
  is_muted TINYINT(1) DEFAULT 0,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_conv_user (conversation_id, user_id),
  INDEX idx_cp_user (user_id),
  INDEX idx_cp_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT DEFAULT NULL,
  message_type ENUM('text','image','file','voice','location','system') DEFAULT 'text',
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  accuracy_m INT DEFAULT NULL,
  is_read TINYINT(1) DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  is_edited TINYINT(1) DEFAULT 0,
  edited_at TIMESTAMP NULL DEFAULT NULL,
  reply_to_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  INDEX idx_messages_conv (conversation_id),
  INDEX idx_messages_sender (sender_id),
  INDEX idx_messages_created (created_at),
  INDEX idx_messages_unread (conversation_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(200) DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  INDEX idx_msg_files_msg (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Communication: live location sharing & dispute access
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS location_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sender_role ENUM('client','provider','admin') NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m INT DEFAULT NULL,
  heading DECIMAL(5,2) DEFAULT NULL,
  speed_kmh DECIMAL(5,2) DEFAULT NULL,
  is_live TINYINT(1) DEFAULT 1,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_loc_conv_user (conversation_id, user_id, created_at),
  INDEX idx_loc_request (request_id, created_at),
  INDEX idx_loc_user_live (user_id, is_live, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS disputes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT DEFAULT NULL,
  conversation_id INT DEFAULT NULL,
  opened_by INT NOT NULL,
  assigned_admin_id INT DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status ENUM('open','under_review','resolved','closed') DEFAULT 'open',
  resolution TEXT DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_disputes_status (status),
  INDEX idx_disputes_request (request_id),
  INDEX idx_disputes_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispute_access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  admin_id INT NOT NULL,
  conversation_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_dispute_logs_dispute (dispute_id, opened_at),
  INDEX idx_dispute_logs_admin (admin_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_archives (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  request_id INT DEFAULT NULL,
  message_count INT DEFAULT 0,
  first_message_at TIMESTAMP NULL DEFAULT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by INT DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  payload LONGTEXT DEFAULT NULL,
  status ENUM('active','expired','restored','deleted') DEFAULT 'active',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_archives_conv (conversation_id),
  INDEX idx_archives_expires (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Reviews (التقييمات)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  provider_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT NULL,
  images JSON DEFAULT NULL,
  is_visible TINYINT(1) DEFAULT 1,
  provider_reply TEXT DEFAULT NULL,
  provider_reply_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_request (request_id, reviewer_id),
  INDEX idx_reviews_provider (provider_id),
  INDEX idx_reviews_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Notifications
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT DEFAULT NULL,
  data JSON DEFAULT NULL,
  link VARCHAR(255) DEFAULT NULL,
  is_read TINYINT(1) DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  channel ENUM('in_app','push','email','whatsapp','sms') DEFAULT 'in_app',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id),
  INDEX idx_notif_read (user_id, is_read),
  INDEX idx_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Subscriptions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) DEFAULT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 30,
  max_offers_per_month INT DEFAULT NULL,
  is_featured TINYINT(1) DEFAULT 0,
  badge VARCHAR(50) DEFAULT NULL,
  features JSON DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_plans_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('pending','active','expired','cancelled') DEFAULT 'pending',
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  auto_renew TINYINT(1) DEFAULT 0,
  payment_id INT DEFAULT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  INDEX idx_subs_user (user_id),
  INDEX idx_subs_status (status),
  INDEX idx_subs_ends (ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Payments
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_id INT DEFAULT NULL,
  request_id INT DEFAULT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_transaction_id VARCHAR(190) DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'SAR',
  payment_method VARCHAR(50) DEFAULT NULL,
  status ENUM('pending','processing','completed','failed','refunded','cancelled') DEFAULT 'pending',
  metadata JSON DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  refunded_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  INDEX idx_payments_user (user_id),
  INDEX idx_payments_status (status),
  INDEX idx_payments_provider_tx (provider_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Ads (الإعلانات الداخلية)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  link VARCHAR(255) DEFAULT NULL,
  placement ENUM('home_top','home_middle','home_bottom','sidebar','search') DEFAULT 'home_top',
  is_active TINYINT(1) DEFAULT 1,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  views_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ads_placement (placement),
  INDEX idx_ads_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Settings (إعدادات الموقع key-value)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_value TEXT DEFAULT NULL,
  setting_type ENUM('string','number','boolean','json','text') DEFAULT 'string',
  setting_group VARCHAR(80) DEFAULT 'general',
  is_public TINYINT(1) DEFAULT 0,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_settings_group (setting_group),
  INDEX idx_settings_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Activity logs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) DEFAULT NULL,
  entity_id INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_logs_user (user_id),
  INDEX idx_logs_action (action),
  INDEX idx_logs_entity (entity_type, entity_id),
  INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Install lock (يمنع إعادة التثبيت)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS install_lock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  is_installed TINYINT(1) DEFAULT 1,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  installed_version VARCHAR(20) DEFAULT '1.0.0',
  installed_by_email VARCHAR(190) DEFAULT NULL,
  site_name VARCHAR(200) DEFAULT NULL,
  site_url VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
