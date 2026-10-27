# النشر والتراجع

## قبل النشر

1. على الخادم: `git -C /opt/aykdmh log --oneline -1`، وقارنه بما ستنشره. لا تنشر نسخة أقدم.
2. شغّل الاختبارات على الـ commit نفسه: `bash deploy/run-tests.sh <مسار نسخة git>`.
3. تأكد أن الـ commit مرفوع إلى GitHub.

## النشر

```
ssh root@84.247.166.216
cd /opt/aykdmh && git pull --ff-only && bash deploy/setup-server.sh
```

السكربت ينفذ بالترتيب: نسخة احتياطية للقاعدة وUFW، ثم يبني الواجهة في `releases/<وقت>`، ثم يبني صورة الـ API، ثم يطبّق الترحيلات، ثم يشغّل LiveKit والـ API، ثم يحوّل `current` إلى الإصدار الجديد، ثم يعيد تحميل Caddy.

## التحقق بعد النشر

```
curl -s -o /dev/null -w "%{http_code}\n" https://aykdmh.com/
curl -s https://aykdmh.com/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://aykdmh.com/livekit/rtc/validate   # 401 متوقع
docker ps --format "{{.Names}} {{.Status}}" | grep aykdmh
```

بعدها افتح الموقع في متصفح وتأكد من عدم وجود أخطاء في وحدة التحكم، ثم سجّل الـ commit المنشور في `PROJECT_STATUS.md`.

> المتصفحات التي فتحت الموقع سابقًا قد تعرض النسخة المخزنة (PWA) حتى إعادة التحميل مرتين أو Ctrl+Shift+R.

## التراجع

- **الواجهة:** `ln -sfn releases/<السابق> /var/www/aykdmh/current`. الإصدارات السابقة محفوظة في `releases/`.
- **الـ API:** `git checkout <commit السابق>` في `/opt/aykdmh`، ثم `docker compose -p aykdmh --env-file .env -f deploy/docker-compose.yml up -d --build app`.
- **القاعدة:** انظر الاستعادة في `DATABASE.md`. الترحيلات لا تُلغى تلقائيًا.

## اختبار المكالمات الحقيقي

`bash deploy/e2e-calls.sh` على الخادم. يشغّل نسخة اختبار معزولة بقاعدة مؤقتة ومتصفحين، ثم يحذفها.
