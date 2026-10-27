# تسليم إلى Codex

الفرع: `claude/deploy-setup` (متفرع من `main` عند `695eb0d`). لم يُعدَّل `main` ولا أي ملف سابق.

## ما أضافه Claude

- `deploy/landing/index.html` — صفحة رئيسية مؤقتة RTL.
- `deploy/nginx/aykdmh.com.conf` — موقع nginx (HTTP؛ certbot يضيف 443).
- `deploy/setup-server.sh` — تجهيز الخادم والشهادة. التشغيل: `sudo bash deploy/setup-server.sh <email>` من جذر المستودع على الخادم.
- `tests/check-deploy.sh` — `bash tests/check-deploy.sh`.
- `docs/PROJECT_PROGRESS.md` — الحالة والمتبقي والمشكلات.

## نقطة الاستلام

الموقع لم يُنشر بعد: الخادم `84.247.166.216` يفتح SSH فقط. الخطوة التالية تشغيل سكربت التجهيز على الخادم، ثم استرجاع كود التطبيق من نشر Vercel `dpl_EobmVg24a2KfZaGUHrLjC5yGfJ9A` (انظر `AWTAD-transfer-kit/HOW-TO-EXPORT.txt`) وإضافته إلى المستودع.

عند نشر التطبيق: ضع ناتج البناء في `/var/www/aykdmh/releases/<stamp>` وحدّث الرابط `current`، وفعّل `location /api/` في إعداد nginx.

## قواعد

لا Force Push، لا رفع `.env` أو أسرار، ونسخة احتياطية قبل أي تغيير على قاعدة البيانات أو الخادم.
