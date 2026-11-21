-- AYK-361 (the owner: «في الإدارة الطلبات… ومقدمي الخدمة… مع إمكانية إخفاء أو حذف لكليهما»).
-- The administration can hide a request or a service provider without deleting them: a hidden
-- request is not offered to providers, a hidden provider is not listed to people asking for a
-- service. Both still use their accounts. Showing them again clears the date.
-- Rollback: ALTER TABLE requests DROP COLUMN hidden_at; ALTER TABLE provider_profiles DROP COLUMN hidden_at;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
