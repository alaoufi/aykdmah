# ترجمة اللغات الجديدة آليًا (AYK-037)

ترجمة نصوص الموقع إلى المليالم والفلبينية والإندونيسية والنيبالية والأمهرية والتركية بنموذج
NLLB-200 مفتوح يعمل على الخادم، بلا خدمة مدفوعة. الترجمة الآلية تحتاج مراجعة متحدث أصلي.

## الملفات

- `mt.py`: يترجم قائمة نصوص إنجليزية فريدة ويحفظ بعد كل 12 نصًا، ويستأنف من حيث توقف.
  المتغيرات: `MT_MODEL` (الافتراضي `facebook/nllb-200-distilled-1.3B`)، `MT_THREADS`، `MT_BEAMS`.
  يحمي `{{المتغيرات}}` والرموز التعبيرية في أول النص وآخره.
- `batch2.cjs` و`notif.cjs`: يجمعان النصوص خارج ملفات اللغة (أسماء المهن والمدن، رسائل الخادم،
  الكتالوج، نصوص HTML قطعة قطعة، قوالب الإشعارات) في `strings2.json`.
- `merge.cjs <repo> <mtDir>`: يدمج النتائج في `client/src/i18n/locales/<lang>.json`،
  و`referenceNames.json`، و`catalogExtraLanguages.json`، و`server/utils/i18n.js`، و`notificationLabels.js`.
- `run-fast.sh`: التشغيل السريع على الخادم (نموذج 600M، فك جشع، أربعة عمال).
- `progress/out` و`progress/out2`: ما اكتمل حتى آخر حفظ (إنجليزي ← ترجمة) لكل لغة.

## الاستئناف من الصفر على الخادم

```bash
# على الخادم: /opt/mt فيه mt.py و strings.json و strings2.json و out/ و out2/
docker run -d --name mt-base -v /opt/mt:/w -v mt-cache:/root/.cache python:3.11-slim sh -c \
  'pip install -q torch --index-url https://download.pytorch.org/whl/cpu && pip install -q transformers sentencepiece && sleep infinity'
bash run-fast.sh
```

`strings.json` = كل القيم الفريدة في `en.json`؛ `strings2.json` من `batch2.cjs` ثم `notif.cjs`.
بعد الانتهاء: انسخ `out` و`out2` محليًا ثم `node scripts/translate/merge.cjs . <المجلد>`،
ثم `npm run i18n:check` و`bash deploy/run-tests.sh`.

## الكود المنتظر

`pending-code.patch`: تسجيل اللغات وترتيبها، وإصلاح رموز اللغات الثلاثية (`fil`)، والملفات الصغيرة
(صفحة عدم الاتصال، صفحة التحديث، الإعلان الافتراضي، كلمات البحث الشائعة)، والترجمة المحلية للمحادثة،
وقوائم اللغات في الخادم والاختبارات. يُطبَّق مع الدمج: `git apply scripts/translate/pending-code.patch`
ثم `merge.cjs` (لأنه يستورد ملفات اللغات الجديدة).
