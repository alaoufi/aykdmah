# جاهزية «أي خدمة» للمتجرين — تقرير فحص (2026-11-03)

> فحص فقط، بلا أي تعديل على العمل القائم ولا نشر. كل نتيجة معها دليلها (ملف أو رابط قابل للتحقق).
> المرجع العام للخطة: `docs/PROJECT_HANDOFF.md`. الأسرار ليست هنا (المستودع عام).

## الخلاصة

| المتجر | الجاهزية التقديرية | الحالة |
|---|---|---|
| Google Play | **85%** | التطبيق **منشور** بإصدار قديم؛ الإصدار 1.3.2 مبني وجاهز للرفع |
| Apple App Store | **60%** | الإصدار 1.0 **أُرسل للمراجعة** ولم يظهر في المتجر بعد؛ المكالمات والإشعارات الأصلية ناقصة |

**القرار:** لا حاجة إلى Capacitor ولا البدء من الصفر. المشروع فيه تطبيقان أصليان قائمان (أندرويد TWA بشيفرة أصلية،
وآيفون SwiftUI + WKWebView) يعرضان نفس الموقع، وتطبيق واحد يخدم طالب الخدمة ومقدمها (الدور من الحساب).

## 1) هل هو موقع فقط؟ لا — فيه تطبيقان

| | الدليل |
|---|---|
| أندرويد `sa.aykdmh.app` (TWA عبر Bubblewrap + شيفرة أصلية) | `android/twa-manifest.json` (الإصدار 1.3.2، رمز 12، minSdk 24)، `android/native/*.kt|.java` (شاشة مكالمة أصلية LiveKit، ConnectionService، خدمة مكالمة بالمقدمة، FCM، تحديث إجباري من Play) |
| آيفون `sa.aykdmh.app` (SwiftUI + WKWebView) | المستودع الخاص `alaoufi/apple-apps` مجلد `aykhidmah/` (الإصدار 1.0.0 بناء 1، فريق Apple مضبوط، APNs بيئة production، وضعا الخلفية audio وremote-notification، أذونات الكاميرا والميكروفون والموقع) |
| ربط الموقع بالتطبيقين | https://aykdmh.com/.well-known/assetlinks.json (بصمتا التوقيع) و https://aykdmh.com/.well-known/apple-app-site-association (يرد 200) |

## 2) توافق الوظائف

| الوظيفة | أندرويد | آيفون | الدليل |
|---|---|---|---|
| الخرائط | ✅ | ✅ | `leaflet`، `react-leaflet`، `maplibre-gl` في `client/package.json` (تعمل داخل المتصفح المضمّن) |
| الموقع الجغرافي | ✅ | ✅ | أذونات أندرويد عبر Chrome؛ آيفون `NSLocationWhenInUseUsageDescription` |
| المحادثات | ✅ | ✅ | `socket.io-client` + `ChatPage.jsx` |
| الإشعارات والتطبيق مغلق | ✅ FCM | ⚠️ صامتة حتى يضع المالك مفتاح APNs | `android/native/FcmService.java`؛ `server/services/apnsService.js` يحتاج `APNS_KEY_ID/TEAM_ID/KEY` |
| مكالمات صوت وفيديو | ✅ محرك أصلي 1.3.x (لم تُجرَّب على جهازين بعد) | ⚠️ عبر WebRTC داخل WKWebView؛ لا CallKit ولا رنين والتطبيق مغلق | `android/native/CallScreenActivity.kt`؛ `apple-apps/aykhidmah/AyKhidmah/WebView.swift` |
| الكاميرا والميكروفون | ✅ | ✅ | `apply.cjs` (RECORD_AUDIO، CAMERA)؛ `requestMediaCapturePermissionFor` في `WebView.swift` |

ملاحظة صوت: شكوى تقطيع ومكبر الصوت قيد المراجعة في `docs/CALL_AUDIO_REVIEW.md` (AYK-167) ولم تُحسم.

## 3) البناء والتوقيع والنشر

| | الحالة | الدليل |
|---|---|---|
| AAB أندرويد | ✅ 1.3.2 موقّع | https://aykdmh.com/dl/aykdmh-1.3.2.aab، البناء `android/build.sh` والنشر `android/publish-apk.sh` |
| مفتاح الرفع | ✅ على الخادم، Play App Signing مفعّل | `docs/APPS_AND_STORES.md`؛ المفاتيح خارج المستودع |
| بناء آيفون ورفعه | ✅ آلي من GitHub Actions (macOS، أرشيف ← IPA ← altool، يفشل ما لم تؤكد Apple) | `apple-apps/.github/workflows/ios.yml` |
| نشر الموقع | ✅ آلي باختبارات (`testdeploy`) | `docs/PROJECT_HANDOFF.md` القسم 2 |

## 4) هل رُفع للمتاجر؟

- **Google Play — نعم، منشور:** https://play.google.com/store/apps/details?id=sa.aykdmh.app (الصفحة ترد 200، آخر تحديث 2026-11-01).
- **App Store — أُرسل ولم يُنشر:** `docs/APPS_AND_STORES.md` يسجل «أي خدمة 1.0 Waiting for Review» بتاريخ 2026-11-02، وبحث Apple
  `itunes.apple.com/lookup?bundleId=sa.aykdmh.app&country=sa` يعطي `resultCount: 0` (غير ظاهر للجمهور بعد).

## 5) متطلبات المتجرين

| المتطلب | الحالة | الدليل |
|---|---|---|
| سياسة الخصوصية | ✅ | https://aykdmh.com/privacy (200) |
| الشروط | ✅ | https://aykdmh.com/terms |
| حذف الحساب من التطبيق والويب | ✅ | https://aykdmh.com/delete-account (200)، `DeleteAccountPage.jsx` |
| الأذونات مبررة | ✅ | نصوص الأذونات في مشروع آيفون؛ قائمة أذونات أندرويد في `apply.cjs` |
| الدفع | ⚠️ وضع اختبار، لا دفع حقيقي | `PAYMENT_PROVIDER: test` في `deploy/docker-compose.yml` |
| خدمة بالمقدمة للمكالمات (أندرويد 14+) | ⚠️ يلزم تصريح في Play Console عند رفع 1.3.2 | `foregroundServiceType="phoneCall|microphone|camera"` في `apply.cjs` |
| لقطات المتجر | ✅ أندرويد (AYK-166) | `docs/store-assets/ayk166/` |

**مخاطر مراجعة آبل:**
- **(4.2 الحد الأدنى للوظائف):** التطبيق يعرض الموقع. يخففه وجود إشعارات وكاميرا وميكروفون وموقع. CallKit والإشعارات الأصلية تقوّيه.
- **(3.1.1 الشراء داخل التطبيق):** بيع الإعلانات أو الاشتراكات داخل تطبيق آيفون بدفع خارجي قد يُرفض. الآمن إخفاؤها في تطبيق آيفون أو تركها معطلة كما الآن.

## 6) الحسابات والرسوم

| | الحالة | الرسوم | الرابط الرسمي |
|---|---|---|---|
| Google Play Console | موجود (حساب «تربح» الشخصي، فيه التطبيق) | 25$ مرة واحدة (مدفوعة) | https://play.google.com/console |
| Apple Developer | موجود (فردي) وسارٍ حتى 2027-07-31 | 99$ سنويًا | https://developer.apple.com/account — App Store Connect: https://appstoreconnect.apple.com |
| مفتاح APNs للإشعارات | **غير موجود** | مجاني | https://developer.apple.com/account/resources/authkeys/list |

## 7) المتبقي بالأولوية

1. **(المالك)** رفع `aykdmh-1.3.2.aab` إلى Google Play وتصريح الخدمة بالمقدمة (مكالمات هاتفية، ميكروفون، كاميرا).
2. **(المالك)** قراءة حالة «أي خدمة» 1.0 في App Store Connect: إن كانت Rejected تُرسل ملاحظة آبل؛ وإن كانت Pending Developer Release يضغط Release.
3. **(المالك)** تجربة المكالمات على جوالين (1.3.2)، مع بيانات شكوى التقطيع (نوع الجهازين، رقم التطبيق، متى يبدأ التقطيع).
4. **(المالك)** إنشاء مفتاح APNs (ملف .p8 مع Key ID وTeam ID)، ثم يضعها المطور في `/opt/aykdmh/.env`.
5. **(المطور)** إشعارات آيفون عبر APNs بعد المفتاح، ثم مكالمات آيفون الأصلية (CallKit + PushKit + LiveKit Swift) وإصدار 1.1.
6. **(المطور)** إخفاء شراء الإعلانات والاشتراكات المدفوعة داخل تطبيق آيفون ما دام الدفع خارجيًا.
7. **(المالك ثم المطور)** الدفع الحقيقي: فقط بعد اجتياز الاختبارات وموافقة المالك.
8. **(المطور)** ترجمة بطاقتي المتجرين بعد اعتماد آبل.

## 8) أقصر مسار عملي

**اليوم:**
1. رفع 1.3.2 إلى «اختبار داخلي» في Play Console أولًا، وهو أسرع مراجعة. يُجرَّب على جوالين، ثم يُنقل للإنتاج.
2. قراءة حالة آبل.

**بعده:**
3. مفتاح APNs، ثم إشعارات آيفون.
4. إصلاح ما تظهره تجربة الجوالين.
5. مكالمات آيفون الأصلية في 1.1.
