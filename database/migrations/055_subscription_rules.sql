-- -----------------------------------------------------
-- Migration 055: monthly subscriptions by area and profession (AYK-042)
--
-- Sign-up is free at first. The administration later turns subscriptions on
-- (setting `subscriptions_enabled` = '1') and lists where they apply: a region,
-- a city and/or a profession (NULL means "all"). A rule with is_free = 1 keeps
-- a profession free there (rare trades) and always wins over a paid rule.
-- Only providers are subscribed; requesters never pay.
--
-- Rollback:
--   DROP TABLE IF EXISTS subscription_rules;
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NULL,
  city_id INT NULL,
  category_id INT NULL,
  is_free SMALLINT NOT NULL DEFAULT 0,
  is_active SMALLINT NOT NULL DEFAULT 1,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_subscription_rules_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_rules_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_rules_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
