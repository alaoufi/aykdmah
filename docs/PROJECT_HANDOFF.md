# PROJECT HANDOFF

```
PROJECT: AYKDMAH

Developer: Claude
Date: 2026-10-28

Repository: alaoufi/aykdmah
Branch: claude/deploy-setup (غير مدمج في main؛ main = 695eb0d)
Latest Commit: انظر `git log -1` — حفظة «نظام التوثيق» التي تلي 81946c3
Push Status: مرفوع ومُتحقق منه بـ git ls-remote

Completed Tasks: AYK-001، 002، 003، 004، 005، 006، 010 (جزئي)، 012، 017، 018، 021، 023
Tasks In Progress: AYK-013 بوابة دفع تجريبية (لم يُكتب كودها بعد)، AYK-007 إعادة الاتصال بعد الانقطاع (متوقفة مؤقتًا)
Pending Tasks: AYK-008، 009، 011، 014، 015، 016، 019، 020، 022 (التفاصيل في docs/TASKS.md)

Tests Passed: خادم 13/13، واجهة 116/116، تكامل 196/196، ترجمات، بناء، audit، فحوص النشر 21/21، مكالمات e2e 13/14، استعادة نسخة احتياطية
Tests Failed: e2e «استمرار المكالمة بعد انقطاع 4 ثوانٍ» (AYK-007)
Tests Not Run: أجهزة جوال فعلية، شبكتان مختلفتان، دفع فعلي، حمل عالٍ

Production Commit: 81946c3 (حفظة التوثيق لا تغيّر التطبيق)
Deployment Status: منشور ويعمل على https://aykdmh.com، والإصدار releases/20261027-220609

Known Issues: AYK-007، والنسخ الاحتياطية على الخادم نفسه فقط (AYK-015)، ونسبة عمولة الكوبون 0% حتى يحددها المالك، و21 مدينة بلا أحياء
Required Environment Variables: على الخادم في /opt/aykdmh/.env: DB_PASSWORD و JWT_SECRET و ENCRYPTION_KEY و LIVEKIT_API_SECRET. البقية في deploy/docker-compose.yml و.env.example
Next Exact Step: AYK-013 — إضافة محوّل «test» في server/services/paymentService.js، وصفحة دفع تجريبية، ومنع السحب في الوضع التجريبي، واختبار تكامل للدورة كاملة
```

## للمطور التالي

- **الدخول للخادم:** `ssh root@84.247.166.216` بمفتاح SSH يضيفه المالك. لا تطلب كلمة المرور.
- **الاختبارات:** `bash deploy/run-tests.sh <نسخة git>` على الخادم. الاختبار الحقيقي للمكالمات: `bash deploy/e2e-calls.sh`.
- **النشر والتراجع:** `docs/DEPLOYMENT.md`.
- **إعادة توليد الأحياء:** `database/geography/SOURCE.md`.
- **حساب الإدارة:** `alaoufi@gmail.com`، وأول كلمة مرور في `/root/aykdmh-admin-credentials.txt` (تُحذف بعد تغييرها).
