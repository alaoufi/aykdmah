-- AYK-439 (the owner: «بيانات التواصل لطالب الخدمة لا تظهر إلا لمقدم الخدمة. كذلك المشاركة يسمح بها خيار
-- تسمح بمشاركتها»). The requester's name, phone and WhatsApp are either hidden or shown to service
-- providers (no «everyone» level: a value 2 from before becomes 1), and others may share the
-- requester's requests only when the requester allows it (off by default; the owner can always share).
UPDATE users SET share_phone = 1 WHERE share_phone > 1;
UPDATE users SET share_whatsapp = 1 WHERE share_whatsapp > 1;
UPDATE users SET share_name = 1 WHERE share_name > 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_request_share SMALLINT NOT NULL DEFAULT 0;
