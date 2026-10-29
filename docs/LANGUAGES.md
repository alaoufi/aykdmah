# اللغات ودليل الاستخدام

اللغات الحالية (مرتبة حسب انتشارها بين مقدمي الخدمة في المملكة): العربية `ar` (الافتراضية، RTL)، والأردية `ur` (RTL)، والهندية `hi`، والبنغالية `bn`، والمليالم `ml`، والفلبينية `fil`، والإندونيسية `id`، والنيبالية `ne`، والأمهرية `am`، والتركية `tr`، والإنجليزية `en`.

> اللغات الست الأخيرة الإضافة (AYK-037) تُرجمت آليًا بنموذج NLLB-200 مفتوح على الخادم (بلا خدمة مدفوعة)، وتحتاج مراجعة متحدث أصلي قبل الاعتماد الرسمي. الأدوات: `mt.py` و`merge.cjs` (وصفها في `scripts/translate/README.md`). اكتملت ونُشرت في `aab47e4`.

## قاعدة إلزامية لكل تطوير

- كل نص جديد في الواجهة يُضاف إلى **كل** ملفات `client/src/i18n/locales/*.json` بترجمة حقيقية، لا بالإنجليزية في لغة أخرى. اختبار `platformLanguages` يرفض ذلك.
- كل ميزة يراها المستخدم تُشرح في **دليل الاستخدام** (`client/src/pages/GuidePage.jsx`، المفاتيح `help.*`) بكل اللغات.
- `npm run i18n:check` يجب أن ينجح (تطابق المفاتيح والمتغيرات `{{...}}`).

## إضافة لغة جديدة

1. **ملف النصوص:** انسخ `client/src/i18n/locales/en.json` إلى `<code>.json` وترجم كل القيم. ممنوع ترك نص إنجليزي.
2. **التسجيل:** أضف اللغة إلى `SUPPORTED_LANGUAGES` في `client/src/i18n/index.js` (الرمز والاسم والاتجاه)، وإلى `client/src/styles/rtl.css` إن كانت RTL.
3. **الملفات التي تذكر اللغات صراحةً** (أضف المفتاح الجديد في كل منها):
   - الواجهة: `client/src/data/servicesCatalog.js`، و`settingLabels.js`، و`notificationLabels.js`، و`referenceNames.json`، و`client/src/utils/localizeDefaultAd.js`، و`localLanguage.js`، و`earlyRecoveryBootstrap.js`، و`client/src/components/home/Hero.jsx`، و`client/src/pages/admin/AdminCountriesPage.jsx`.
   - ملفات عامة: `client/public/offline.js` و`client/public/refresh-site.js`.
   - الترجمة المحلية للمحادثات: `client/src/workers/localLanguage.worker.js` و`components/chat/LocalMessageTranslation.jsx` (تحقق أن النموذج يدعم اللغة).
   - الخادم: `server/utils/i18n.js` (رسائل الخادم)، و`server/services/entityTranslator.js`، و`translationService.js`، و`server/utils/catalogValidation.js`.
   - الفحص: `scripts/check-translations.js`، و`client/tests/platformLanguages.test.js`، و`server/tests/i18n.test.js`.
4. **قاعدة البيانات:** أسماء التصنيفات والخدمات في `name_translations`. أضف ترحيلًا بترجمات اللغة الجديدة (مثل الترحيل 040).
5. **التحقق:** شغّل `npm run i18n:check` و`bash deploy/run-tests.sh`، وافتح الموقع باللغة الجديدة وراجع الصفحة الرئيسية والتسجيل والدليل والمحفظة.

- رمز اللغة قد يكون ثلاثة أحرف (`fil`): لا تقص الرمز بـ `slice(0, 2)` بل افصله بـ `split(/[-_]/)[0]`.

- 2026-10-29 (AYK-040): مفاتيح `work.*` ونصوص دليل `help.client_steps` و`help.provider_steps` الجديدة كُتبت يدويًا باللغات الإحدى عشرة، وصُححت تسميات `request.agreed` و`request.contact` و`request.contact_owner` و`nav.order_now` التي جاءت من الترجمة الآلية غير دقيقة.

> للبحث عن أي موضع منسي: `git grep -nE "'bn'|\bbn:" -- client/src server scripts client/public`
