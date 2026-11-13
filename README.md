# أي خدمة (Ay Khidma)

منصة تربط طالب الخدمة بمقدّمها: طلبات، عروض وتفاوض، محادثات، خرائط، ومكالمات صوتية ومرئية. الموقع: https://aykdmh.com

## التقنيات

| الجزء | التقنية |
|---|---|
| الواجهة | React 18 + Vite، PWA، عربي RTL مع 5 لغات (ar, en, ur, hi, bn) |
| الخادم | Node.js 22 + Express، Socket.IO للوقت الفوري |
| قاعدة البيانات | PostgreSQL 16 (ترحيلات في `database/migrations`) |
| الخرائط | Leaflet مع بلاط OpenFreeMap (عبر MapLibre)، وبحث العناوين من OpenStreetMap عبر الخادم |
| المكالمات | LiveKit مفتوح المصدر على الخادم نفسه (WebRTC)، دون تسجيل |
| الاستضافة | خادم Contabo واحد: Caddy (HTTPS تلقائي) + حاويات Docker |

## التشغيل المحلي

```
npm ci && npm --prefix server ci && ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm --prefix client ci
cp server/.env.example .env      # ثم املأ قيم قاعدة بيانات تطوير محلية
npm run dev
```

## الاختبارات

على أي جهاز Linux فيه Docker (يطابق CI، ويستخدم PostgreSQL مؤقتة ثم يحذفها):

```
bash deploy/run-tests.sh
```

اختبار مكالمة حقيقية بين متصفحين على الخادم (بيئة اختبار معزولة): `bash deploy/e2e-calls.sh`.

## النشر

على الخادم: `cd /opt/aykdmh && git pull && bash deploy/setup-server.sh`
يأخذ السكربت نسخة احتياطية من القاعدة، ويبني الواجهة في إصدار جديد، ويطبّق الترحيلات. التفاصيل في `docs/DEPLOYMENT.md`.

لا تُرفع ملفات `.env` أو أي أسرار إلى Git.

## للمطورين

ابدأ بـ `AGENTS.md`، ثم `docs/PROJECT_HANDOFF.md` و`docs/PROJECT_STATUS.md` و`docs/TASKS.md`. بقية التوثيق في `docs/`: ARCHITECTURE وDATABASE وDEPLOYMENT وSERVER_CONFIG وTEST_RESULTS وDECISIONS وCHANGELOG.
