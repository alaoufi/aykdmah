-- Auto-generated from database/migrations/053_gulf_new_languages.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE countries SET languages_enabled = '["ar","ur","hi","bn","ml","fil","id","ne","am","tr","en"]'
 WHERE languages_enabled = '["ar","en","ur","bn","hi"]';
