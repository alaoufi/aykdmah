# استعادة «أي خدمة» من نسخة احتياطية: دليل لأي مطور

هذا الملف موجود **داخل كل نسخة احتياطية** باسم `README-RESTORE.md`، وفي المستودع `docs/RESTORE.md`.
يكفي وحده لإعادة بناء الموقع aykdmh.com على خادم جديد من نسخة واحدة.

## 1. أين النسخ
| المكان | المدة | الملف |
|---|---|---|
| الخادم `84.247.166.216` | آخر 14 يومًا | `/root/backups/daily/<YYYYMMDD-HHMMSS>/` (غير مشفر، root فقط) |
| Cloudflare R2، المخزن `aykdmh-backups` | آخر 30 يومًا | `daily/aykdmh-<YYYYMMDD-HHMMSS>.tar.enc` (مشفر) |

**مفتاح فك التشفير** عند المالك في مدير كلمات المرور، باسم «مفتاح تشفير نسخ أي خدمة R2». بدونه لا تُفتح نسخ R2.
وعلى الخادم نفسه في `/etc/aykdmh/backup-encryption.key`. **لا يُرسل في محادثة ولا يُرفع إلى Git.**

## 2. ما في النسخة
| الملف | المحتوى |
|---|---|
| `db.dump` | قاعدة PostgreSQL كاملة (`pg_dump -Fc`) |
| `code.bundle` | الكود كاملًا بتاريخه وكل الفروع، ومعه **تعليمات المشروع**: `CLAUDE.md` و`AGENTS.md` و`docs/` (المرجع الأساسي `docs/PROJECT_HANDOFF.md`) |
| `env` | ملف `.env` للخادم: كل الأسرار (قاعدة البيانات، JWT، التشفير، LiveKit، الإشعارات، R2) |
| `local-files.tgz` | ملفات الخادم غير الموجودة في Git (بلا `node_modules` و`dist`، فهي تُبنى من الكود) |
| `server-settings.tgz` | `/etc/aykdmh` (مفتاح R2 للنسخ)، ووحدات systemd الخاصة بـ «أي خدمة»، وعدّاد الإصدارات `/var/lib/aykdmh`، و**مفتاح توقيع تطبيق أندرويد وكلمات مروره** `/root/aykdmh-android/keys` (بدونه لا يُحدَّث التطبيق في Google Play) |
| `uploads.tgz` | مجلد الرفع القديم (المرفقات صارت في قاعدة البيانات أو في R2 `aykdmh-media`) |
| `SHA256SUMS` | بصمة كل ملف |
| `README-RESTORE.md` | هذا الدليل |

مرفقات المستخدمين الجديدة (AYK-248) في مخزن R2 مستقل `aykdmh-media`، ولا تحتاج استعادة: يكفي أن يحمل `env`
قيم `R2_MEDIA_*`.

## 3. فك نسخة R2
```bash
# على أي جهاز Linux: نزّل الملف من لوحة Cloudflare (R2، ثم aykdmh-backups، ثم daily)، ثم:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:backup-encryption.key \
  -in aykdmh-<stamp>.tar.enc | tar xf -
cd <stamp> && sha256sum -c SHA256SUMS      # كل سطر يجب أن يقول OK
```
مفتاح التشفير يُكتب في ملف `backup-encryption.key` بسطر واحد، كما حفظه المالك.

## 4. إعادة البناء على خادم جديد (Ubuntu 24.04)
```bash
# 1) الأدوات
apt-get update && apt-get install -y docker.io docker-compose-v2 git

# 2) الكود والأسرار
git clone code.bundle /opt/aykdmh
cd /opt/aykdmh && git checkout claude/deploy-setup      # الفرع المعتمد للإنتاج
cp /path/to/<stamp>/env /opt/aykdmh/.env && chmod 600 .env
tar xzf /path/to/<stamp>/local-files.tgz -C /opt/aykdmh
tar xzf /path/to/<stamp>/server-settings.tgz -C /      # /etc/aykdmh ووحدات systemd

# 3) قاعدة البيانات أولًا، ثم الاستعادة
docker compose -p aykdmh --env-file .env -f deploy/docker-compose.yml up -d db
docker exec -i aykdmh-db pg_restore -U aykdmh -d aykdmh --no-owner --clean --if-exists < /path/to/<stamp>/db.dump

# 4) الواجهة والـ API والمكالمات: سكربت النشر المعتمد (يبني الواجهة، ويطبق الترحيلات، ويشغّل الحاويات)
bash deploy/release-app.sh
docker ps --format '{{.Names}} {{.Status}}' | grep aykdmh
```
تفاصيل النشر والتراجع والمنافذ في `docs/DEPLOYMENT.md` و`docs/COOLIFY_RUNTIME.md` و`deploy/docker-compose.yml`.

## 5. الدخول من الإنترنت (البوابة المشتركة)
- الموقع لا يفتح منافذ 80 و443 بنفسه. يمر عبر **البوابة المحايدة** في المستودع `alaoufi/server-edge` (Caddy).
  ملف موقعه هناك `sites/aykdmh.com.caddy`، ومكالمات TURN في `l4/aykdmh.com.caddy`.
- **قبل أي عمل على خادم مشترك:** اقرأ `COORDINATION.md` في `server-edge`، فهو ملزم.
- **على خادم جديد:** شغّل البوابة حسب `server-edge/docs/SETUP.md`، ثم وجّه DNS لـ aykdmh.com إليه. **تغيير DNS بموافقة المالك فقط.**

## 6. بعد الاستعادة
- **الفحوص:** `bash deploy/security-check.sh`، و`curl https://aykdmh.com/api/health`، وتسجيل دخول، ومحادثة، ومكالمة بين جهازين.
- **النسخ الليلية:** `bash deploy/install-security-export.sh`، ومؤقت `aykdmh-backup` (`systemctl list-timers`).
  ثم اختبار R2: `bash deploy/r2-verify.sh`.
- **التوثيق:** اكتب ما حدث في `docs/TEST_RESULTS.md` (النتائج الحقيقية فقط)، وفي `docs/CHANGELOG.md`.

## 7. قواعد يجب احترامها
- **اقرأ أولًا** `CLAUDE.md` و`AGENTS.md` في جذر الكود.
- **كل الرسائل للمالك بالعربية.** والأوامر له سطر واحد في PowerShell، واحدًا واحدًا.
- **لا** `git reset`، **ولا** `push --force`، **ولا** أسرار في Git.
- **موافقة المالك الصريحة** لأي دفع حقيقي، أو حذف، أو تغيير DNS، أو اشتراك مدفوع.
- **لا تلمس** أي موقع آخر على الخادم المشترك («أكلات جدتنا»، «تربح»، «أوتاد سدير»). لكل موقع جلسته ومستودعه.
