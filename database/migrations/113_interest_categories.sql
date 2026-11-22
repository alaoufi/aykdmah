-- AYK-447 (the owner: «إذا لم يطلب من قبل يُطلب منه تحديد طلبه من قائمة الأقسام، وممكن يحدد أكثر من قسم»):
-- the sections a requester chose before his first request, for «مشابه لطلبي». A JSON list of category ids.
ALTER TABLE users ADD COLUMN IF NOT EXISTS interest_category_ids TEXT NULL DEFAULT NULL;
