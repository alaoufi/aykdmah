-- Auto-generated from database/migrations/061_call_diagnostics_details.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

ALTER TABLE call_diagnostics ADD COLUMN IF NOT EXISTS details VARCHAR(600) NULL DEFAULT NULL;
