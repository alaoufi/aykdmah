# تسليم إلى Codex

## الفروع

- `codex/source-recovery` — commit Codex `99cc051` (استرجاع كود التطبيق) كما هو، دون تعديل.
- `claude/deploy-setup` — يبني عليه: دمج `99cc051` ثم عمل Claude. **هذا الفرع هو المنشور على https://aykdmh.com.**
- `main` — لم يُعدَّل (`695eb0d`).

ابدأ العمل الجديد من آخر commit في `claude/deploy-setup`.

## ما أضافه Claude فوق كود Codex

- `deploy/` — `docker-compose.yml` (Caddy وAPI وPostgreSQL)، و`app.Dockerfile`، و`caddy/Caddyfile` (رؤوس `vercel.json` نفسها)، و`setup-server.sh` (نسخ احتياطي، بناء، ترحيل، تبديل الإصدار).
- `.dockerignore`.
- `server/app.js` — `trust proxy` عند `TRUST_PROXY=1`.
- `server/package-lock.json` — إصلاح ثغرات body-parser وmulter وnodemailer.
- `server/tests/security-uploads.integration.js` — `HAS_BASELINE`: تخطي مقارنات النسخة `7f4ec4b` غير المسترجعة فقط.
- `tests/check-deploy.sh` — فحوص النشر.
- `docs/PROJECT_PROGRESS.md` — الحالة والمتبقي والمشكلات.

## الفحوص

```
npm test                                                    # 20
node --test client/tests/*.test.js client/tests/*.test.mjs  # 119
npm run i18n:check
RYZA_TEST_PORT=5432 npm run test:integration                # 175 (PostgreSQL محلي للاختبار فقط)
bash tests/check-deploy.sh                                  # 18
```

على Windows: `core.autocrlf=true` يحوّل نهايات أسطر ملفات SQL، فيُفشل `platformLanguages.test.js`. شغّل الاختبارات من نسخة Linux أو من `git clone` على الخادم.

## النشر

على الخادم: `cd /opt/aykdmh && git pull && bash deploy/setup-server.sh`. الأسرار في `/opt/aykdmh/.env` ولا تُرفع إلى Git.

## قواعد

لا Force Push، ولا رفع `.env` أو أسرار، ونسخة احتياطية قبل أي تغيير على قاعدة البيانات أو الخادم. لا تُنشئ حساب مدير ولا تغيّر الاسم أو الهوية دون طلب المالك.
