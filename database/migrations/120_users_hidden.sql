-- AYK-504 (the owner: «الإخفاء يختفي عرضه على الموقع في أي مكان حتى المحادثات»): the administration can hide an account.
-- A hidden member disappears from everything other people see: provider lists and the map, the directory, the public
-- page, requests, offers, reviews, and the conversations of the people who talked to them. The account itself still works
-- for its owner, and the administration still sees it (marked «مخفي»). Showing it again clears the column.
-- Rollback: ALTER TABLE users DROP COLUMN hidden_at;   (nothing else depends on it)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL DEFAULT NULL;
