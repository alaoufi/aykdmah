-- AYK-418 (the owner): a requester chooses, in «ملفي», to show their phone and WhatsApp to the
-- providers of their requests' professions, and whether the site may contact them about what is
-- new. All three are off until the person turns them on.
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_phone SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_whatsapp SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMP NULL;
