-- AYK-377 (the owner: «أضف وصفًا لخدمات مقدم الخدمة، ويُعرض في لوحته، يتمدد النص وينكمش»). The
-- provider's own description (provider_profiles.bio) in the 11 languages, filled after each save:
-- {"ar": "...", "en": "...", ...}. NULL until the provider writes one.
-- Rollback: ALTER TABLE provider_profiles DROP COLUMN bio_translations;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS bio_translations JSONB DEFAULT NULL;
