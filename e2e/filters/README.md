# اختبارات الفلاتر (AYK-496 / AYK-497)

قاعدة بيانات مؤقتة جديدة + التطبيق + بيانات كبيرة مولّدة، ثم فحص كل فلتر منفردًا ومركبًا **مقابل استعلام SQL مستقل**، وفي المتصفح بثلاثة أحجام شاشة. لا تلمس الإنتاج، وترفض أي منفذ PostgreSQL غير محلي.

```
AYK_TEST_PORT=55432 npm run test:filters            # الكل (يشغّل البيئة ويوقفها)
AYK_TEST_PORT=55432 npm run test:filters:api         # الواجهة البرمجية فقط
FILTERS_VIEWPORTS=mobile node e2e/filters/ui-guest.e2e.mjs   # (بعد تشغيل stack.cjs) حجم واحد
```
- `stack.cjs` يبدأ البيئة (و`FILTERS_REQUESTS/PROVIDERS/CLIENTS` لتكبير البيانات) ويكتب `.out/fixtures.json`.
- `api-*.mjs`: القوائم والفلاتر. `api-property.mjs`: تراكيب fast-check. `api-fuzz.mjs`: مدخلات شاذة.
- `ui-*.e2e.mjs`: الزائر، المزود، طالب الخدمة والمحادثات، الإدارة. التغيير السريع مع إبطاء الاستجابة الأقدم.
- `perf.mjs [label]`: p50/p95/max. `explain.mjs`: `EXPLAIN (ANALYZE, BUFFERS)` لأبطأ ما نُفّذ (`SQL_TRACE=1 SQL_TRACE_FILE=…`).
- التقارير في `.out/*.json` (خارج Git).
