import { tx } from '../utils/localize.js';

const label = (en, ar, ur, hi, bn) => ({ en, ar, ur, hi, bn });

// Exact public adapter metadata from the built-in registry. Unknown or edited
// descriptions are kept verbatim; credential keys and submitted values never change.
export const integrationLabels = [
  label('Maps', 'الخرائط', 'نقشے', 'मानचित्र', 'মানচিত্র'),
  label('Payment', 'الدفع', 'ادائیگی', 'भुगतान', 'পেমেন্ট'),
  label('AI', 'الذكاء الاصطناعي', 'مصنوعی ذہانت', 'कृत्रिम बुद्धिमत्ता', 'কৃত্রিম বুদ্ধিমত্তা'),
  label('Delivery', 'التوصيل', 'ترسیل', 'डिलीवरी', 'ডেলিভারি'),
  label('Console (dev only)', 'سجل الخادم (للتطوير فقط)', 'سرور کا لاگ (صرف ترقی کے لیے)', 'सर्वर लॉग (केवल विकास के लिए)', 'সার্ভার লগ (শুধু ডেভেলপমেন্টের জন্য)'),
  label('Mock (dev only)', 'محاكاة (للتطوير فقط)', 'نقلی سروس (صرف ترقی کے لیے)', 'नकली सेवा (केवल विकास के लिए)', 'নকল সেবা (শুধু ডেভেলপমেন্টের জন্য)'),
  label('Nafath API (custom endpoint)', 'Nafath API (عنوان ربط مخصص)', 'Nafath API (اپنی سروس کا پتہ)', 'Nafath API (कस्टम सेवा पता)', 'Nafath API (কাস্টম সেবার ঠিকানা)'),
  label('twilio.com SMS API', 'واجهة الرسائل النصية عبر twilio.com', 'twilio.com کے ذریعے ایس ایم ایس سروس', 'twilio.com की एसएमएस सेवा', 'twilio.com-এর এসএমএস সেবা'),
  label('Saudi SMS gateway (oneapi.unifonic.com)', 'بوابة رسائل نصية سعودية (oneapi.unifonic.com)', 'سعودی ایس ایم ایس سروس (oneapi.unifonic.com)', 'सऊदी एसएमएस सेवा (oneapi.unifonic.com)', 'সৌদি এসএমএস সেবা (oneapi.unifonic.com)'),
  label('Logs the SMS to the server console — never use in production', 'يسجّل الرسالة النصية في سجل الخادم — للاختبار فقط ولا يُستخدم في الموقع الفعلي', 'ایس ایم ایس کو سرور کے لاگ میں لکھتا ہے — صرف جانچ کے لیے، حقیقی سروس میں استعمال نہ کریں', 'एसएमएस को सर्वर लॉग में लिखता है — केवल परीक्षण के लिए, वास्तविक सेवा में उपयोग न करें', 'এসএমএস সার্ভার লগে লেখে — শুধু পরীক্ষার জন্য, চালু সেবায় ব্যবহার করবেন না'),
  label('Official WhatsApp Business Cloud API via Meta Graph', 'واجهة WhatsApp Business السحابية الرسمية عبر Meta Graph', 'Meta Graph کے ذریعے WhatsApp Business کی سرکاری کلاؤڈ سروس', 'Meta Graph के ज़रिए आधिकारिक WhatsApp Business क्लाउड सेवा', 'Meta Graph-এর মাধ্যমে WhatsApp Business-এর আনুষ্ঠানিক ক্লাউড সেবা'),
  label('Prints to server console', 'يسجّل الرسالة في سجل الخادم', 'پیغام کو سرور کے لاگ میں لکھتا ہے', 'संदेश को सर्वर लॉग में लिखता है', 'সার্ভার লগে বার্তা লেখে'),
  label('sendgrid.com transactional email', 'إرسال رسائل البريد للعمليات عبر sendgrid.com', 'sendgrid.com کے ذریعے کارروائیوں کی ای میل بھیجتا ہے', 'sendgrid.com के ज़रिए लेनदेन ईमेल भेजता है', 'sendgrid.com-এর মাধ্যমে লেনদেনের ইমেইল পাঠায়'),
  label('resend.com transactional email', 'إرسال رسائل البريد للعمليات عبر resend.com', 'resend.com کے ذریعے کارروائیوں کی ای میل بھیجتا ہے', 'resend.com के ज़रिए लेनदेन ईमेल भेजता है', 'resend.com-এর মাধ্যমে লেনদেনের ইমেইল পাঠায়'),
  label('Generic Nafath gateway — plug in your integrator base URL', 'بوابة Nafath عامة — أدخل عنوان الربط الأساسي لمزودك', 'عام Nafath سروس — اپنے فراہم کنندہ کی سروس کا بنیادی پتہ درج کریں', 'सामान्य Nafath सेवा — अपने प्रदाता की सेवा का मूल पता दर्ज करें', 'সাধারণ Nafath সেবা — আপনার প্রদানকারীর সেবার মূল ঠিকানা লিখুন'),
  label('Returns a fake transaction id + 2-digit code', 'يعيد معرّف عملية تجريبيًا ورمزًا من رقمين', 'جانچ کے لیے نقلی کارروائی کا شناختی نمبر اور دو ہندسوں کا کوڈ دیتا ہے', 'परीक्षण के लिए नकली लेनदेन पहचान और दो अंकों का कोड देता है', 'পরীক্ষার জন্য নকল লেনদেনের পরিচয় ও দুই অঙ্কের কোড দেয়'),
  label('Account SID', 'معرّف الحساب (SID)', 'اکاؤنٹ کا شناختی نمبر (SID)', 'खाते की पहचान (SID)', 'অ্যাকাউন্টের পরিচয় (SID)'),
  label('Auth Token', 'رمز المصادقة', 'تصدیقی ٹوکن', 'प्रमाणीकरण टोकन', 'প্রমাণীকরণ টোকেন'),
  label('From number', 'رقم المرسل', 'بھیجنے والے کا نمبر', 'भेजने वाले का नंबर', 'প্রেরকের নম্বর'),
  label('App SID', 'معرّف التطبيق (SID)', 'ایپ کا شناختی نمبر (SID)', 'ऐप की पहचान (SID)', 'অ্যাপের পরিচয় (SID)'),
  label('Sender name', 'اسم المرسل', 'بھیجنے والے کا نام', 'भेजने वाले का नाम', 'প্রেরকের নাম'),
  label('Sender name fallback', 'اسم المرسل البديل', 'بھیجنے والے کا متبادل نام', 'भेजने वाले का वैकल्पिक नाम', 'প্রেরকের বিকল্প নাম'),
  label('Phone Number ID', 'معرّف رقم الجوال', 'موبائل نمبر کا شناختی نمبر', 'मोबाइल नंबर की पहचान', 'মোবাইল নম্বরের পরিচয়'),
  label('Access Token', 'رمز الوصول', 'رسائی کا ٹوکن', 'एक्सेस टोकन', 'অ্যাক্সেস টোকেন'),
  label('OTP template name (optional)', 'اسم قالب رمز التحقق (اختياري)', 'تصدیقی کوڈ کے سانچے کا نام (اختیاری)', 'सत्यापन कोड टेम्पलेट का नाम (वैकल्पिक)', 'যাচাইকরণ কোড টেমপ্লেটের নাম (ঐচ্ছিক)'),
  label('Template language (ar/en/…)', 'لغة القالب (ar/en/…)', 'سانچے کی زبان (ar/en/…)', 'टेम्पलेट की भाषा (ar/en/…)', 'টেমপ্লেটের ভাষা (ar/en/…)'),
  label('API Key', 'مفتاح الربط (API)', 'سروس کی کلید (API)', 'सेवा की कुंजी (API)', 'সেবার কী (API)'),
  label('From email', 'بريد المرسل', 'بھیجنے والے کا ای میل', 'भेजने वाले का ईमेल', 'প্রেরকের ইমেইল'),
  label('From name', 'اسم المرسل', 'بھیجنے والے کا نام', 'भेजने वाले का नाम', 'প্রেরকের নাম'),
  label('Base URL', 'عنوان الربط الأساسي', 'سروس کا بنیادی پتہ', 'सेवा का मूल पता', 'সেবার মূল ঠিকানা'),
  label('Client ID', 'معرّف العميل', 'کلائنٹ کا شناختی نمبر', 'क्लाइंट की पहचान', 'ক্লায়েন্টের পরিচয়'),
  label('Client Secret', 'المفتاح السري للعميل', 'کلائنٹ کی خفیہ کلید', 'क्लाइंट की गुप्त कुंजी', 'ক্লায়েন্টের গোপন কী'),
  label('Base URL fallback', 'عنوان الربط الأساسي البديل', 'سروس کا متبادل بنیادی پتہ', 'सेवा का वैकल्पिक मूल पता', 'সেবার বিকল্প মূল ঠিকানা'),
  label('Taqnyat SMS (Bearer token)', 'تقنيات Taqnyat (رمز Bearer)', 'تقنیات Taqnyat (Bearer ٹوکن)', 'तक़नियात Taqnyat (Bearer टोकन)', 'তাকনিয়াত Taqnyat (Bearer টোকেন)'),
  label('Saudi SMS gateway using a Bearer token (api.taqnyat.sa or api-sms.4jawaly.com)', 'بوابة رسائل نصية سعودية برمز Bearer (api.taqnyat.sa أو api-sms.4jawaly.com)', 'Bearer ٹوکن کے ساتھ سعودی ایس ایم ایس سروس (api.taqnyat.sa یا api-sms.4jawaly.com)', 'Bearer टोकन वाली सऊदी एसएमएस सेवा (api.taqnyat.sa या api-sms.4jawaly.com)', 'Bearer টোকেনসহ সৌদি এসএমএস সেবা (api.taqnyat.sa বা api-sms.4jawaly.com)'),
  label('4jawaly SMS', 'فور جوالي 4jawaly', 'فور جوالی 4jawaly', '4jawaly एसएमएस', '4jawaly এসএমএস'),
  label('Saudi SMS gateway (api-sms.4jawaly.com) using an app key and secret', 'بوابة رسائل نصية سعودية (api-sms.4jawaly.com) بمفتاح التطبيق والسر', 'ایپ کلید اور خفیہ کلید کے ساتھ سعودی ایس ایم ایس سروس (api-sms.4jawaly.com)', 'ऐप कुंजी और गुप्त कुंजी वाली सऊदी एसएमएस सेवा (api-sms.4jawaly.com)', 'অ্যাপ কী ও গোপন কীসহ সৌদি এসএমএস সেবা (api-sms.4jawaly.com)'),
  label('API URL', 'رابط الـAPI', 'API کا لنک', 'API लिंक', 'API লিংক'),
  label('Bearer token', 'رمز Bearer (app_secret)', 'Bearer ٹوکن (app_secret)', 'Bearer टोकन (app_secret)', 'Bearer টোকেন (app_secret)'),
  label('App key', 'مفتاح التطبيق (app_key)', 'ایپ کلید (app_key)', 'ऐप कुंजी (app_key)', 'অ্যাপ কী (app_key)'),
  label('App secret', 'سر التطبيق (app_secret)', 'ایپ کی خفیہ کلید (app_secret)', 'ऐप गुप्त कुंजी (app_secret)', 'অ্যাপ গোপন কী (app_secret)'),
  label('Provider request failed', 'تعذر تنفيذ الطلب لدى المزود', 'فراہم کنندہ کو بھیجی گئی درخواست ناکام ہو گئی', 'प्रदाता को भेजा गया अनुरोध विफल हुआ', 'প্রদানকারীকে পাঠানো অনুরোধ ব্যর্থ হয়েছে'),
];

const byOriginal = new Map(integrationLabels.map(entry => [entry.en, entry]));

export function localizedIntegrationText(value, lang) {
  if (typeof value !== 'string') return '';
  const entry = byOriginal.get(value);
  return entry ? tx(entry, lang) : value;
}
