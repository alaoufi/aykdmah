-- Auto-generated from database/migrations/019_ad_placement_pricing.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

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

ALTER TABLE ads ADD COLUMN IF NOT EXISTS exclusive SMALLINT NOT NULL DEFAULT 0;
