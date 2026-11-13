-- Auto-generated from database/migrations/049_otp_four_digits.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE settings SET setting_value = '4' WHERE setting_key = 'verify_otp_length' AND setting_value = '6';
