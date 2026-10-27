-- Auto-generated from database/migrations/008_dispute_workflow.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

SELECT 1;

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS frozen SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_locked SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratings_allowed TEXT CHECK (ratings_allowed IN ('both','client_only','provider_only','none','pending'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal';

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
