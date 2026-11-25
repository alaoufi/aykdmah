-- Auto-generated from database/migrations/119_requests_category_from_service.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE requests SET category_id = (SELECT s.category_id FROM services s WHERE s.id = requests.service_id)
WHERE category_id IS NULL AND service_id IS NOT NULL;
