-- AYK-443 (the owner: «هل ترغب في تذكيرك إذا توفر طلب مناسب لك؟»): a service provider who said yes is
-- told about every new request in his profession and area, even outside his working hours.
ALTER TABLE users ADD COLUMN IF NOT EXISTS request_alerts SMALLINT NOT NULL DEFAULT 0;
