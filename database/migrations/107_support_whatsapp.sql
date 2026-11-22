-- AYK-437 (the owner: «تواصل مع الدعم الفني يكون أيقونة واتس اب ويحوّل على رقم الدعم الفني… وتحفظ في
-- قائمة يراجعها الدعم الفني»). Each tap on the support WhatsApp icon is kept here (who, when, from
-- which page, the text it opened with), so support can review and mark it handled.
CREATE TABLE IF NOT EXISTS support_whatsapp_contacts (
  id SERIAL PRIMARY KEY,
  user_id INT NULL,
  page VARCHAR(300) NULL,
  message VARCHAR(1000) NULL,
  lang VARCHAR(10) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at TIMESTAMP NULL,
  handled_by INT NULL
);
CREATE INDEX IF NOT EXISTS support_whatsapp_contacts_created ON support_whatsapp_contacts (created_at DESC);
