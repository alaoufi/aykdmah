# تسليم إلى Codex

الفرع المنشور على https://aykdmh.com: `claude/deploy-setup`. ابدأ من آخر commit فيه. فرع `main` لم يُعدَّل.

## البنية على الخادم (Contabo، Ubuntu 24.04)

| الحاوية | الدور | المنافذ العامة |
|---|---|---|
| `aykdmh-web` | Caddy 2.8.4: HTTPS، الواجهة الثابتة من `/var/www/aykdmh/current`، وتمرير `/api` و`/socket.io` و`/livekit` | 80، 443 |
| `aykdmh-app` | Node 22 API (`deploy/app.Dockerfile`) | لا شيء |
| `aykdmh-db` | PostgreSQL 16 | لا شيء |
| `aykdmh-livekit` | LiveKit v1.13.9 للمكالمات | 7881/tcp، 7882/udp، 3478/udp |

Coolify مثبت على الخادم من قبل ولا يُستخدم. لا تعدّله.

- المستودع: `/opt/aykdmh`. الأسرار: `/opt/aykdmh/.env` (صلاحية 600). النسخ الاحتياطية: `/root/backups/`.
- النشر: `cd /opt/aykdmh && git pull && bash deploy/setup-server.sh`.
- الاختبارات: `bash deploy/run-tests.sh`. المكالمة الحقيقية: `bash deploy/e2e-calls.sh`.
- ترحيل جديد: أضف ملفًا في `database/migrations` ثم `NODE_ENV=test node scripts/append-pg-migrations.cjs` لتحديث `database/postgres/RUN-ME.sql`.

## الميزات المضافة في هذه المرحلة

- **الخرائط:** `client/src/components/map/BaseTileLayer.jsx` (بلاط OpenFreeMap داخل Leaflet)، `/api/geo/search` (Nominatim عبر `server/services/nominatimClient.js`)، `/api/providers/nearby`، صفحتا `/providers/map` و`/providers/:id`. الموقع الدقيق لمقدم الخدمة لا يظهر إلا بموافقته (`show_location_on_map`).
- **المكالمات:** `server/services/callService.js` و`server/routes/callRoutes.js` و`client/src/context/CallContext.jsx` و`client/src/components/calls/`. صلاحية الاتصال = صلاحية المراسلة (`Conversation.canSend`). لا تسجيل.
- **الإدارة:** `/admin/calls` (إحصاءات وبلاغات، بيانات وصفية فقط).
- **الهوية:** «أي خدمة» وشعارها في `client/public/brand` و`client/public/icons`.
- **كلمات المرور:** حد أدنى 4 خانات، وإلزام التغيير عند أول دخول (`users.must_change_password`).

## معلّق

- استمرار المكالمة بعد انقطاع الشبكة: آلية إعادة الانضمام موجودة، لكن فحص الانقطاع 4 ثوانٍ في `e2e/calls.e2e.mjs` لم ينجح بعد.
- إشعارات Web Push للمكالمات والتطبيق مغلق: غير منفذة.
- TURN عبر TLS (للشبكات المقيّدة جدًا): يحتاج نطاقًا فرعيًا وشهادة.
- النظام الجغرافي الشامل للمملكة: مطلوب من المالك، ولم يبدأ.

## قواعد

لا Force Push، ولا رفع `.env` أو أسرار، ونسخة احتياطية قبل أي تغيير على القاعدة أو الخادم. لا دفع حقيقي قبل الاختبار وموافقة المالك.
