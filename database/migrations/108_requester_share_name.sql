-- AYK-438 (the owner: «لطالب الخدمة خيار: الاسم، الجوال، الواتس؛ ظهوره لمقدمي الخدمة أو ظهوره في لوحة
-- العرض، وتأكد أنه إذا وافق على ظهورها تظهر»). Each of the three has a level: 0 hidden (default),
-- 1 shown to service providers, 2 shown to everyone on the request's panel. share_phone and
-- share_whatsapp already hold 0/1 (AYK-418), so their meaning stays the same.
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_name SMALLINT NOT NULL DEFAULT 0;
