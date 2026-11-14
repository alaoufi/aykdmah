# أي خدمة (Ay Khidma)

منصة تربط طالب الخدمة بمقدّمها: طلبات، عروض وتفاوض، محادثات، خرائط، ومكالمات صوتية ومرئية. الموقع: https://aykdmh.com

## التقنيات

| الجزء | التقنية |
|---|---|
| الواجهة | React 18 + Vite، PWA، عربي RTL مع 11 لغة (ar, en, ur, hi, bn, ml, fil, id, ne, am, tr) |
| الخادم | Node.js 22 + Express، Socket.IO للوقت الفوري |
| قاعدة البيانات | PostgreSQL 16 (ترحيلات في `database/migrations`) |
| الخرائط | Leaflet مع بلاط OpenFreeMap (عبر MapLibre)، وبحث العناوين من OpenStreetMap عبر الخادم |
| المكالمات | LiveKit مفتوح المصدر على الخادم نفسه (WebRTC)، دون تسجيل |
| الاستضافة | خادم Contabo واحد (84.247.166.216): مدخل Caddy مشترك (`aykdmh-web`) + واجهة في Coolify + حاويات Docker للـ API وقاعدة البيانات وLiveKit |
| التطبيقات | أندرويد (TWA، `sa.aykdmh.app`، مجلد `android/`) وآيفون (WKWebView)، يفتحان الموقع نفسه ويستخدمان `https://aykdmh.com/api` |

## التشغيل المحلي من الصفر

المتطلبات: Node.js 22 وPostgreSQL 16 (أو Docker).

```
npm ci && npm --prefix server ci && ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm --prefix client ci
cp .env.example .env      # املأ DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD لقاعدة تطوير محلية، وJWT_SECRET وENCRYPTION_KEY
npm run seed              # ينشئ الجداول بكل الترحيلات وبيانات البداية
npm run dev               # الخادم على 5000 والواجهة على 5173
```

قائمة متغيرات البيئة بأسمائها وشرحها في `.env.example` (لا قيم حقيقية فيه). قيم الإنتاج في `/opt/aykdmh/.env` على الخادم فقط.

## الاختبارات

على أي جهاز Linux فيه Docker (يطابق CI، ويستخدم PostgreSQL مؤقتة ثم يحذفها):

```
bash deploy/run-tests.sh
```

اختبار مكالمة حقيقية بين متصفحين على الخادم (بيئة اختبار معزولة): `bash deploy/e2e-calls.sh`.

## النشر والتراجع

الفرع الذي يسحبه الخادم: `claude/deploy-setup`. لا يوجد نشر تلقائي: GitHub Actions (`ci.yml`) يشغّل الفحوص فقط.

على الخادم (root):

```
cd /opt/aykdmh && git pull --ff-only && bash deploy/release-app.sh
```

يأخذ نسخة احتياطية من القاعدة، ويبني إصدار الواجهة والـ API، ويطبّق الترحيلات، ثم يبدّل الإصدار. `deploy/setup-server.sh` قديم ويرفض العمل عمدًا. التراجع في `docs/DEPLOYMENT.md`.

- قاعدة الإنتاج: PostgreSQL 16 في الحاوية `aykdmh-db`، القاعدة `aykdmh`، المجلد `aykdmh_pgdata`. الوسائط في المجلد `aykdmh_uploads`. التفاصيل في `docs/DATABASE.md`.
- النسخ الاحتياطي اليومي: `deploy/backup.sh` (مؤقت systemd). فحص شامل مع نسخة وتجربة استعادة معزولة: `bash deploy/audit-backup.sh [--encrypt]`.
- المدخل المشترك `deploy/caddy/Caddyfile` يوجّه أيضًا موقعًا آخر على الخادم نفسه؛ اقرأ `docs/CLEANUP_2026-11-14.md` قبل تعديله.

لا تُرفع ملفات `.env` أو أي أسرار إلى Git.

## للمطورين

ابدأ بـ `AGENTS.md`، ثم `docs/PROJECT_HANDOFF.md` و`docs/PROJECT_STATUS.md` و`docs/TASKS.md`. بقية التوثيق في `docs/`: ARCHITECTURE وDATABASE وDEPLOYMENT وSERVER_CONFIG وTEST_RESULTS وDECISIONS وCHANGELOG.
