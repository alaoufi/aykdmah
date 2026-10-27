# قاعدة البيانات

PostgreSQL 16 في الحاوية `aykdmh-db` (القاعدة والمستخدم `aykdmh`). غير مكشوفة للإنترنت. فيها 56 جدولًا و44 ترحيلًا مطبقًا (2026-10-28).

## الترحيلات

- الملفات في `database/migrations` (لهجة MySQL، والمترجم `installService.mysqlToPg`). تُطبَّق مرة واحدة وتُسجَّل في `schema_migrations`.
- ترحيل جديد: أضف `0NN_name.sql` بخطة تراجع في رأسه، ثم `NODE_ENV=test node scripts/append-pg-migrations.cjs` لتحديث `database/postgres/RUN-ME.sql` و`database/postgres/migrations`.
- لا تعدّل ترحيلًا طُبّق في الإنتاج. أضف ترحيلًا جديدًا.
- تجنّب الرمز `` ` `` داخل النصوص، لأن المترجم يعامله كاقتباس معرّفات.

| الترحيل | الغرض | التراجع |
|---|---|---|
| 041 | `provider_profiles.show_location_on_map` وفهارس الموقع | في رأس الملف |
| 042 | `calls` و`call_reports` (بيانات وصفية فقط) | في رأس الملف |
| 043 | `users.must_change_password` | في رأس الملف |
| 044 | تفعيل كل مناطق المملكة ومدنها | إعادة تحديثات 030 |
| 045 | الكوبونات والمحافظ والسحوبات وإعداداتها | في رأس الملف |
| 046 | 2,931 حيًا بمصدرها وحالة تحقق | في رأس الملف (يحفظ الأحياء المستخدمة) |

## الجداول الأساسية

`users` و`provider_profiles` و`requests` و`offers` و`conversations` و`conversation_participants` و`messages` و`regions` و`governorates` و`cities` و`districts` و`subscriptions` و`payments` و`calls` و`wallet_transactions` و`referral_rewards` و`withdrawal_requests` و`settings`.

## النسخ الاحتياطية

- `deploy/setup-server.sh` يأخذ نسخة `pg_dump -Fc` قبل كل نشر إلى `/root/backups/aykdmh-db-<وقت>.dump`.
- **آخر تجربة استعادة ناجحة:** 2026-10-28. استُعيدت النسخة في قاعدة مؤقتة وطابقت الإنتاج في كل الجداول المفحوصة، ثم حُذفت القاعدة المؤقتة.
- **نقص معروف (AYK-015):** النسخ على الخادم نفسه فقط، وليست مجدولة يوميًا. المطلوب تخزين مستقل.

### الاستعادة

```
docker exec -i aykdmh-db pg_restore -U aykdmh -d aykdmh --clean < /root/backups/aykdmh-db-<stamp>.dump
```

جرّبها أولًا في حاوية مؤقتة، ثم على الإنتاج بعد أخذ نسخة جديدة.

## بيانات حساسة

لا بيانات عملاء في المستودع. كلمات المرور مشفّرة bcrypt. الآيبان مخزّن في `withdrawal_requests` ولا يظهر للمستخدم إلا آخر 4 أرقام.
