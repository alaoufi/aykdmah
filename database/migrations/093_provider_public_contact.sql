-- AYK-314 (the owner's decision): a provider may show their mobile number and a WhatsApp number on
-- their public page and in the «دليلي» of whoever kept them. Both are off until the provider turns
-- them on in «ملفي». The mobile shown is the account's own phone; WhatsApp may be another number.
-- Additive only. Rollback:
--   ALTER TABLE provider_profiles DROP COLUMN show_phone, DROP COLUMN whatsapp, DROP COLUMN show_whatsapp;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS show_phone SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS show_whatsapp SMALLINT NOT NULL DEFAULT 0;
