-- -----------------------------------------------------
-- Migration 019: per-placement ad pricing + exclusive flag
--
-- Different placements (home_top, sidebar, footer, …) carry
-- different audience values, so each one now owns its own
-- per-day and per-1k-views rate. The advertiser pays the SUM of
-- every selected placement's rate.
--
-- The exclusive flag lets a single advertiser take over a
-- placement alone — when set, no other ad rotates with it in
-- that placement. Costs more (each placement row has its own
-- exclusive multiplier).
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_placement_pricing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placement VARCHAR(40) NOT NULL UNIQUE,
  price_per_day DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  price_per_1k_views DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  exclusive_multiplier DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed all 15 known placements with sensible defaults. The most
-- visible spots (home_top / home_hero) are priced highest.
INSERT IGNORE INTO ad_placement_pricing (placement, price_per_day, price_per_1k_views, exclusive_multiplier) VALUES
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
('footer',                   2,  3, 2.00);

-- Per-ad exclusive flag — when set, the ad takes over the placement
-- alone, no shared rotation. The submit flow charges extra (the
-- exclusive_multiplier from each chosen placement). No AFTER clause so
-- this ALTER works even if migration 016 hasn't run yet.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS exclusive TINYINT(1) NOT NULL DEFAULT 0;
