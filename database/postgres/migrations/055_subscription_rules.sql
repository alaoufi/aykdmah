-- Auto-generated from database/migrations/055_subscription_rules.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS subscription_rules (
  id SERIAL PRIMARY KEY,
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
