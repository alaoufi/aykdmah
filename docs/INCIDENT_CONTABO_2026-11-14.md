# حادثة Contabo (رسالة 2026-11-14) — النتيجة 2026-11-17

رسالة من Contabo عن دخول غير مصرح به لبنيتها، وإعادة تعيين كلمات مرور VNC.

## الفحص (قراءة فقط)
- `server-edge/scripts/incident-check.sh` و`incident-detail.sh` و`deploy/incident-logins.sh`.
- **دخول root:** كله من شبكات STC السعودية (`188.51`، `188.52`، `46.184`). جوال المالك يستخدم IPv6 وIPv4 مشتركًا متغيرًا من نفس النطاقات. ودخول يوم 15 كان بالمفتاح. لا دخول root من خارج السعودية.
- **`jdatna-deploy`:** بمفتاح من عناوين GitHub/Azure، وهو نشر «أكلات جدتنا» الآلي.
- **`172.31.240.4`:** دخول root بمفتاح من عنوان داخلي، غالبًا Coolify. لم يُتحقق منه بعد.
- **`freellm-lab`:** مختبر FreeLLMAPI تجريبي، أُوقف وحُذف بأمر root يوم 15 (20:06–20:26). بقي منه `/etc/ssh/sshd_config.d/zz-freellmapi-lab.conf` (`Match User freellm-lab` فقط، والمستخدم محذوف فلا أثر له). حذفه ينتظر موافقة المالك.
- **لا دخول من شاشة VNC، ولا حسابات أو مفاتيح أو برامج غريبة.**
- **إعدادات sshd الفعلية:** `passwordauthentication no`، `permitrootlogin without-password`.

## الإجراءات (المالك)
- تغيير كلمة مرور root (`passwd`): تم.
- التحقق بخطوتين في Contabo (Google Authenticator): مفعّل.
- تجديد Client Secret لواجهة Contabo البرمجية: تم.
- تغيير كلمة مرور حساب Contabo: تم.
- قرار المالك: الدخول بالمفتاح فقط يبقى، وكلمة المرور للطوارئ عبر VNC.

## ملاحظات للمتابعة
- سجن `recidive` لم يحظر أحدًا (Total banned 0)، مع أن `209.99.190.186` حُظر 10 مرات في يوم: يقرأ من journal بينما fail2ban يكتب في `/var/log/fail2ban.log`. يحتاج إصلاحًا.
