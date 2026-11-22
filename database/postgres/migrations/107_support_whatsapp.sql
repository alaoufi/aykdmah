-- Auto-generated from database/migrations/107_support_whatsapp.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

CREATE TABLE IF NOT EXISTS support_whatsapp_contacts (
  id SERIAL PRIMARY KEY,
  user_id INT NULL,
  page VARCHAR(300) NULL,
  message VARCHAR(1000) NULL,
  lang VARCHAR(10) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at TIMESTAMP NULL,
  handled_by INT NULL
);
CREATE INDEX IF NOT EXISTS support_whatsapp_contacts_created ON support_whatsapp_contacts (created_at DESC);
