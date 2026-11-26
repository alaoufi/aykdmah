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
| 047 | `users.also_client` («كلاهما»)، و`provider_profiles.coverage_city_id`، وجدول `provider_coverage_districts` لأحياء التغطية | في رأس الملف |
| 048 | توفر مقدم الخدمة: `availability_status` و`vacation_from/to` و`work_days` و`work_from/to` في `provider_profiles` | في رأس الملف |
| 049 | رمز التحقق 4 أرقام (يغيّر القيمة الافتراضية 6 فقط) | في رأس الملف |
| 050 | جدول `phone_codes` لرموز التسجيل واستعادة كلمة المرور قبل وجود جلسة (تجزئة HMAC فقط) | في رأس الملف |
| 051–072 | انظر رأس كل ملف في `database/migrations` (الاشتراكات، الدليل، ذاكرة الترجمة، المفضلة، الجلسات، القفل…) | في رأس الملف |
| 073 | جدول `ui_text_overrides` لنصوص الموقع المعدّلة من الإدارة (AYK-210) | حذف الجدول |
| 074 | إعداد `support_whatsapp` (AYK-212) | حذف الإعداد |
| 075 | إعداد `form_fields_hidden` لإخفاء حقول النماذج (AYK-215) | حذف الإعداد |
| 076 | إعداد `form_fields_required` للحقول الإجبارية (AYK-218) | حذف الإعداد |
| 077 | إعدادا `google_play_url` و`app_store_url` لشارتي المتجرين (AYK-227) | حذف الإعدادين |
| 078 | جدول `request_translations` لترجمات عنوان الطلب وتفاصيله لكل لغة (AYK-229) | حذف الجدول |
| 079 | إعداد `form_fields_top` لمكان الحقول مع النشر الأول أو الثاني (AYK-230) | حذف الإعداد |
| 080 | فهارس المحادثات: `message_files(message_id)` و`messages(conversation_id, id)` وفهرس الرسائل غير المقروءة (AYK-231) | `DROP INDEX` |
| 081 | جدول `message_translations` لترجمات الرسائل لكل لغة، وعمود `users.ui_lang` لغة المستخدم (AYK-231) | حذف الجدول والعمود |

## الإنتاج (متحقق 2026-11-14)

القاعدة `aykdmh` في الحاوية `aykdmh-db` (PostgreSQL 16.15، المجلد `aykdmh_pgdata`)، والـ API يتصل بها عبر `DB_HOST=db` دون `DATABASE_URL`. الوسائط المرفوعة داخل القاعدة نفسها (جدول `uploaded_media`، عمود `data BYTEA`)، فنسخة `pg_dump` تشملها. فحص كامل مع نسخة وتجربة استعادة معزولة: `bash deploy/audit-backup.sh [--encrypt]`.

## الجداول الأساسية

`users` و`provider_profiles` و`requests` و`offers` و`conversations` و`conversation_participants` و`messages` و`regions` و`governorates` و`cities` و`districts` و`subscriptions` و`payments` و`calls` و`wallet_transactions` و`referral_rewards` و`withdrawal_requests` و`settings`، وجداول الترجمة `translation_memory` و`message_translations` و`request_translations`.

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

## الأماكن التي تعدّلها الإدارة تبقى مع أي تحديث (AYK-505)

- الأحياء والمدن والمحافظات والمناطق التي تعدّلها الإدارة أو تضيفها من «المناطق والمدن» محفوظة في قاعدة البيانات نفسها، ولا يعيد التحديث (النشر) استيرادها من ملفات: الترحيلات تُطبَّق مرة واحدة وتُسجَّل في `schema_migrations`.
- حتى لو أُعيد تشغيل كل الترحيلات من الصفر، لا يتغير حي عدّله المالك ولا يُحذف حي أضافه (اختبار تكامل `AYK-505`).
- **قاعدة للمطور:** أي ترحيل جديد (121 فأكثر) يحتوي `UPDATE` أو `DELETE FROM` أو `TRUNCATE` على `districts` أو `cities` أو `governorates` أو `regions` أو `countries` يرفضه اختبار `migrations-geography.test.js` ما لم يحمل التعليق `keeps-admin-edits` ويقتصر على الصفوف التي ما زالت بقيمتها الأصلية (انظر الترحيل 070 مثالًا).
- النسخة الاحتياطية الليلية (`db.dump`) تحفظ هذه التعديلات مع بقية القاعدة.
