-- AYK-366 (the owner: «متاح يعني لم يعتذر عن العمل… خارج الخدمة المجدول مثل من الساعة … إلى … ومن … إلى …،
-- الجمعة من الساعة … إلى …، أو متاح 24 ساعة»). A weekly schedule with several periods a day and a
-- different set for each day: {"0": [["08:00","12:00"], ["16:00","22:00"]], "5": [["16:00","22:00"]]}.
-- A day not listed is a day off; a period may end after midnight ("20:00"–"02:00"); "24:00" ends
-- at midnight. NULL keeps the older single setting (work_days, work_from, work_to); with those also
-- empty the provider works 24 hours every day.
-- Rollback: ALTER TABLE provider_profiles DROP COLUMN work_schedule;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT NULL;
