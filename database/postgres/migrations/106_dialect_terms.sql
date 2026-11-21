-- Auto-generated from database/migrations/106_dialect_terms.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS dialect_terms (
  term VARCHAR(40) NOT NULL,
  category_id INT NOT NULL,
  service_id INT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (term, category_id, service_id)
);
CREATE INDEX IF NOT EXISTS dialect_terms_term ON dialect_terms (term);
CREATE TABLE IF NOT EXISTS dialect_term_flags (
  term VARCHAR(40) PRIMARY KEY,
  status VARCHAR(10) NOT NULL,
  category_id INT NULL,
  service_id INT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
