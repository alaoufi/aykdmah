-- AYK-381 (the owner: «المحادثة واحدة بين الشخصين… كما في الواتس اب تمامًا، ويستطيع حذف الرسالة وتبقى
-- للإدارة عند النزاع»). «حذف لدي»: a message one person removed from their own screen only. The
-- message itself is untouched: the other person still sees it, and the administration sees it in a
-- dispute. («حذف لدى الجميع» is messages.deleted_at, kept for disputes as before.)
-- Rollback: DROP TABLE message_hidden;
CREATE TABLE IF NOT EXISTS message_hidden (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id)
);
