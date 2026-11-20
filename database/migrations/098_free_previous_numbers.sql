-- AYK-357, the owner's correction: «بعد تبديل رقمه يكون رقمه القديم محرّرًا ويدخل في طابور التسجيل
-- التلقائي، محرّرًا من أي تبعات». A previous number no longer reaches its old account; it is free
-- again. (Chats, requests and everything else belong to the account itself, not to its number.)
DELETE FROM account_number_aliases;
