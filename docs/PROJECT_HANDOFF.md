# PROJECT HANDOFF

```
PROJECT: AYKDMAH

Developer: Claude
Date: 2026-10-28

Repository: alaoufi/aykdmah
Branch: claude/deploy-setup (غير مدمج في main؛ main = 695eb0d)
Latest Commit: حفظة التوثيق التي تلي 4946b1d (انظر git log -1)
Push Status: مرفوع ومُتحقق منه بـ git ls-remote

Completed Tasks: AYK-001، 002، 003، 004، 005، 006، 010 (جزئي)، 012، 013، 017، 018، 021، 023، 026، 027
Tasks In Progress: لا شيء
Pending Tasks: AYK-029 (التوفر والإجازات، التالية)، AYK-028 (الجوال والثيمات)، AYK-007، 008، 009، 011، 014، 015، 016، 019، 020، 022، 024، 025 (التفاصيل في docs/TASKS.md)

Tests Passed: خادم 13/13، واجهة 116/116، تكامل 204/204، ترجمات 1551×5، بناء، audit 0، فحوص النشر، مكالمات e2e 13/14 (سابقًا)، استعادة نسخة احتياطية
Tests Failed: e2e «استمرار المكالمة بعد انقطاع 4 ثوانٍ» (AYK-007)
Tests Not Run: تسجيل حساب فعلي من جوال حقيقي بإذن الموقع، أجهزة جوال فعلية، شبكتان مختلفتان، دفع حقيقي، حمل عالٍ

Production Commit: 4946b1d (ثم حفظة التوثيق وتعديل نص «طالب خدمة»)
Deployment Status: منشور ويعمل على https://aykdmh.com — الواجهة releases/20261027-235506، الدفع PAYMENT_PROVIDER=test

Known Issues: AYK-007، والنسخ الاحتياطية على الخادم فقط (AYK-015)، ونسبة عمولة الكوبون 0% حتى يحددها المالك، و21 مدينة بلا أحياء، وبيانات التجارب يجب حذفها قبل البوابة الحقيقية (AYK-024)
Required Environment Variables: على الخادم في /opt/aykdmh/.env: DB_PASSWORD و JWT_SECRET و ENCRYPTION_KEY و LIVEKIT_API_SECRET. والبقية في deploy/docker-compose.yml (منها PAYMENT_PROVIDER=test) و.env.example
Next Exact Step: AYK-029 توفر مقدم الخدمة (إجازة بتاريخين، وإيقاف وتفعيل، وساعات وأيام العمل، وظهورها في البحث)، ثم AYK-028 (ترتيب الجوال والثيمات: فاتح وداكن، وألوان متعددة، وتباين عالٍ، وحجم الخط)
```

## للمطور التالي

- **الدخول للخادم:** `ssh root@84.247.166.216` بمفتاح SSH يضيفه المالك. لا تطلب كلمة المرور.
- **الاختبارات:** `bash deploy/run-tests.sh <نسخة git>` على الخادم. الاختبار الحقيقي للمكالمات: `bash deploy/e2e-calls.sh`.
- **النشر والتراجع:** `docs/DEPLOYMENT.md`. **اللغات:** `docs/LANGUAGES.md`.
- **إعادة توليد الأحياء:** `database/geography/SOURCE.md`.
- **حساب الإدارة:** `alaoufi@gmail.com`، وأول كلمة مرور في `/root/aykdmh-admin-credentials.txt` (تُحذف بعد تغييرها).
- **تجربة الدفع:** اشترك كمقدم خدمة في باقة مدفوعة، ثم صفحة «دفع تجريبي»، ثم «إتمام». الاشتراك يتفعّل، وعمولة الكوبون تُحسب إن حدد المالك نسبة.
