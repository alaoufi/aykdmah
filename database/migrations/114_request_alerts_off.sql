-- AYK-456 (the owner: «أي طلب خدمة جديد يرسل إشعارًا لجميع مقدمي نفس المهنة في نطاق تغطيتهم»): every
-- provider of the profession covering the area is told, unless he turned the notices off himself.
ALTER TABLE users ADD COLUMN IF NOT EXISTS request_alerts_off SMALLINT NOT NULL DEFAULT 0;
