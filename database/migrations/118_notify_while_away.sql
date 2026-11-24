-- AYK-484 (the owner: «التنبيهات حسب طلبه: إذا يرغب في وصول التنبيهات وهو غير متاح للعمل فلا بأس، ممكن يرتاح
-- ويرغب في جمع عملاء يتفق معهم عند عودته»): a provider who paused his work or is on leave is not told about
-- new requests, unless he chose to be (notify_while_away). His own «turn the notices off» still wins.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_while_away SMALLINT NOT NULL DEFAULT 0;
