# تسليم إلى Codex

الفرع: `claude/deploy-setup` (متفرع من `main` عند `695eb0d`). لم يُعدَّل `main` ولا أي ملف سابق.

## ما أضافه Claude

- `deploy/landing/index.html` — صفحة رئيسية مؤقتة RTL.
- `deploy/caddy/Caddyfile` و`deploy/docker-compose.yml` — حاوية `aykdmh-web` بخادم Caddy مع HTTPS تلقائي.
- `deploy/setup-server.sh` — نشر إصدار جديد. على الخادم: `cd /opt/aykdmh && git pull && bash deploy/setup-server.sh`.
- `tests/check-deploy.sh` — `bash tests/check-deploy.sh`.
- `docs/PROJECT_PROGRESS.md` — الحالة والمتبقي والمشكلات.

## نقطة الاستلام

الصفحة المؤقتة منشورة على https://aykdmh.com. استُخدم Caddy في حاوية بدل nginx على النظام حتى لا يتعارض مع Coolify الخاص المثبت سابقًا (لم يُعدَّل). إن قُرر النشر عبر Coolify لاحقًا، أوقف الحاوية أولًا لتحرير 80/443.

الخطوة التالية: استرجاع كود التطبيق من نشر Vercel `dpl_EobmVg24a2KfZaGUHrLjC5yGfJ9A` (انظر `AWTAD-transfer-kit/HOW-TO-EXPORT.txt`) وإضافته إلى المستودع. عند نشره: ضع ناتج البناء في `/var/www/aykdmh/releases/<stamp>` وحدّث الرابط `current`، وفعّل `handle /api/*` في `Caddyfile`.

## قواعد

لا Force Push، لا رفع `.env` أو أسرار، ونسخة احتياطية قبل أي تغيير على قاعدة البيانات أو الخادم.
