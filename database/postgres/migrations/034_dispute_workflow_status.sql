-- Auto-generated from database/migrations/034_dispute_workflow_status.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check;

ALTER TABLE disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('open','under_review','waiting_response','escalated','resolved','rejected','closed'));
