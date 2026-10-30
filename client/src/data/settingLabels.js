import { tx } from '../utils/localize.js';

const L = (ar, en, ur, hi, bn) => ({ ar, en, ur, hi, bn });

// These source descriptions belong to the application's seeded settings.
// A label changes language only while its key and source text still match.
export const SETTING_LABELS = Object.freeze({
  site_name: L('اسم الموقع', 'Site name', 'ویب سائٹ کا نام', 'वेबसाइट का नाम', 'ওয়েবসাইটের নাম'),
  site_description: L('وصف الموقع', 'Site description', 'ویب سائٹ کی تفصیل', 'वेबसाइट का विवरण', 'ওয়েবসাইটের বিবরণ'),
  site_logo: L('شعار الموقع', 'Site logo', 'ویب سائٹ کا لوگو', 'वेबसाइट का लोगो', 'ওয়েবসাইটের লোগো'),
  site_email: L('البريد العام', 'Public email address', 'عوامی ای میل پتہ', 'सार्वजनिक ईमेल पता', 'সাধারণ ইমেইল ঠিকানা'),
  site_phone: L('هاتف التواصل', 'Contact phone number', 'رابطے کا فون نمبر', 'संपर्क फ़ोन नंबर', 'যোগাযোগের ফোন নম্বর'),
  default_language: L('اللغة الافتراضية', 'Default language', 'پہلے سے منتخب زبان', 'डिफ़ॉल्ट भाषा', 'ডিফল্ট ভাষা'),
  default_currency: L('العملة الافتراضية', 'Default currency', 'پہلے سے منتخب کرنسی', 'डिफ़ॉल्ट मुद्रा', 'ডিফল্ট মুদ্রা'),
  map_provider: L('مزود الخرائط osm|google', 'Map provider (osm | google)', 'نقشے فراہم کرنے والا (osm | google)', 'मानचित्र प्रदाता (osm | google)', 'মানচিত্র প্রদানকারী (osm | google)'),
  default_lat: L('خط العرض الافتراضي', 'Default latitude', 'پہلے سے منتخب عرض بلد', 'डिफ़ॉल्ट अक्षांश', 'ডিফল্ট অক্ষাংশ'),
  default_lng: L('خط الطول الافتراضي', 'Default longitude', 'پہلے سے منتخب طول بلد', 'डिफ़ॉल्ट देशांतर', 'ডিফল্ট দ্রাঘিমাংশ'),
  search_radius_km: L('نصف قطر البحث بالكيلومتر', 'Search radius in kilometres', 'تلاش کا دائرہ، کلومیٹر میں', 'खोज का दायरा, किलोमीटर में', 'অনুসন্ধানের ব্যাসার্ধ, কিলোমিটারে'),
  allow_registration: L('السماح بالتسجيل', 'Allow registration', 'رجسٹریشن کی اجازت', 'पंजीकरण की अनुमति', 'নিবন্ধনের অনুমতি'),
  require_email_verification: L('يتطلب توثيق البريد', 'Require email verification', 'ای میل کی تصدیق ضروری ہے', 'ईमेल सत्यापन आवश्यक है', 'ইমেইল যাচাই প্রয়োজন'),
  require_provider_verification: L('يتطلب توثيق مقدمي الخدمة', 'Require service provider verification', 'خدمت فراہم کرنے والوں کی تصدیق ضروری ہے', 'सेवा प्रदाताओं का सत्यापन आवश्यक है', 'সেবাদাতাদের যাচাই প্রয়োজন'),
  contact_after_done_days: L('أيام بقاء المحادثة مفتوحة بعد انتهاء الطلب', 'Days the chat stays open after a request ends', 'درخواست ختم ہونے کے بعد گفتگو کھلی رہنے کے دن', 'अनुरोध समाप्त होने के बाद चैट खुली रहने के दिन', 'অনুরোধ শেষের পর চ্যাট খোলা থাকার দিন'),
  max_offers_per_request: L('حد أقصى للعروض', 'Maximum offers per request', 'فی درخواست پیشکشوں کی زیادہ سے زیادہ تعداد', 'प्रति अनुरोध प्रस्तावों की अधिकतम संख्या', 'প্রতি অনুরোধে প্রস্তাবের সর্বোচ্চ সংখ্যা'),
  commission_percent: L('نسبة العمولة %', 'Commission percentage (%)', 'کمیشن کی شرح (%)', 'कमीशन की दर (%)', 'কমিশনের হার (%)'),
  maintenance_mode: L('وضع الصيانة', 'Maintenance mode', 'دیکھ بھال کا موڈ', 'रखरखाव मोड', 'রক্ষণাবেক্ষণ মোড'),
  chat_archive_retention_days: L('مدة الاحتفاظ بأرشيف المحادثات بالأيام', 'Chat archive retention in days', 'محفوظ گفتگو رکھنے کی مدت، دنوں میں', 'चैट का संग्रह रखने की अवधि, दिनों में', 'চ্যাটের আর্কাইভ রাখার সময়, দিনে'),
  chat_archive_after_days: L('بعد كم يوم من اكتمال الطلب يتم أرشفة المحادثة تلقائياً', 'Days after request completion before chats are archived automatically', 'درخواست مکمل ہونے کے کتنے دن بعد گفتگو خودکار طور پر محفوظ کی جائے', 'अनुरोध पूरा होने के कितने दिन बाद चैट अपने आप संग्रहित हो', 'অনুরোধ সম্পন্ন হওয়ার কত দিন পরে চ্যাট স্বয়ংক্রিয়ভাবে আর্কাইভ হবে'),
  location_share_ttl_minutes: L('مدة صلاحية مشاركة الموقع المباشرة بالدقائق', 'Live location sharing expiry in minutes', 'براہ راست مقام کی شراکت کی مدت، منٹوں میں', 'लाइव स्थान साझा करने की अवधि, मिनटों में', 'লাইভ অবস্থান শেয়ারের মেয়াদ, মিনিটে'),
  chat_lock_after_completion: L('قفل المحادثة بعد اكتمال الطلب', 'Lock chats after request completion', 'درخواست مکمل ہونے کے بعد گفتگو بند کریں', 'अनुरोध पूरा होने के बाद चैट बंद करें', 'অনুরোধ সম্পন্ন হওয়ার পরে চ্যাট বন্ধ করুন'),
  review_auto_hide_reports: L('إخفاء تلقائي للتقييم عند بلوغ هذا العدد من البلاغات', 'Automatically hide a review after this many reports', 'اتنی شکایات آنے پر جائزہ خودکار طور پر چھپائیں', 'इतनी शिकायतें मिलने पर समीक्षा अपने आप छिपाएँ', 'এতগুলো অভিযোগ পেলে রিভিউ স্বয়ংক্রিয়ভাবে লুকান'),
  review_translation_provider: L('مزود الترجمة (mymemory | google | none)', 'Translation provider (mymemory | google | none)', 'ترجمہ فراہم کرنے والا (mymemory | google | none)', 'अनुवाद प्रदाता (mymemory | google | none)', 'অনুবাদ প্রদানকারী (mymemory | google | none)'),
  google_translate_api_key: L('مفتاح Google Translate API (اختياري)', 'Google Translate API key (optional)', 'Google Translate API کی کلید (اختیاری)', 'Google Translate API कुंजी (वैकल्पिक)', 'Google Translate API কী (ঐচ্ছিক)'),
  verify_methods_enabled: L('طرق التحقق المتاحة (sms,whatsapp,email,nafath)', 'Available verification methods (sms, whatsapp, email, nafath)', 'دستیاب تصدیقی طریقے (sms, whatsapp, email, nafath)', 'उपलब्ध सत्यापन तरीके (sms, whatsapp, email, nafath)', 'উপলব্ধ যাচাই পদ্ধতি (sms, whatsapp, email, nafath)'),
  verify_required_for_provider: L('طرق التحقق المطلوبة لمقدّمي الخدمة (مفصولة بفاصلة)', 'Required provider verification methods (comma separated)', 'خدمت فراہم کنندہ کے لیے ضروری تصدیقی طریقے (کوما سے الگ)', 'सेवा प्रदाता के लिए आवश्यक सत्यापन तरीके (अल्पविराम से अलग)', 'সেবাদাতার প্রয়োজনীয় যাচাই পদ্ধতি (কমা দিয়ে আলাদা)'),
  verify_required_for_client: L('طرق التحقق المطلوبة للعملاء (فارغ = اختياري)', 'Required customer verification methods (empty = optional)', 'گاہک کے لیے ضروری تصدیقی طریقے (خالی = اختیاری)', 'ग्राहक के लिए आवश्यक सत्यापन तरीके (खाली = वैकल्पिक)', 'গ্রাহকের প্রয়োজনীয় যাচাই পদ্ধতি (খালি = ঐচ্ছিক)'),
  verify_block_until_verified: L('منع استخدام المنصة قبل التحقق', 'Block platform use until verification', 'تصدیق سے پہلے پلیٹ فارم کا استعمال روکیں', 'सत्यापन से पहले प्लेटफ़ॉर्म का उपयोग रोकें', 'যাচাইয়ের আগে প্ল্যাটফর্ম ব্যবহার বন্ধ রাখুন'),
  verify_otp_length: L('طول رمز OTP', 'OTP code length', 'OTP کوڈ کی لمبائی', 'OTP कोड की लंबाई', 'OTP কোডের দৈর্ঘ্য'),
  verify_otp_ttl_minutes: L('مدة صلاحية OTP بالدقائق', 'OTP expiry in minutes', 'OTP کی میعاد، منٹوں میں', 'OTP की वैधता, मिनटों में', 'OTP-এর মেয়াদ, মিনিটে'),
  verify_otp_resend_seconds: L('فترة الانتظار قبل إعادة الإرسال (ثوانٍ)', 'Wait before resending (seconds)', 'دوبارہ بھیجنے سے پہلے انتظار (سیکنڈ)', 'दोबारा भेजने से पहले प्रतीक्षा (सेकंड)', 'আবার পাঠানোর আগে অপেক্ষা (সেকেন্ড)'),
  verify_otp_max_attempts: L('أقصى عدد محاولات قبل قفل الرمز', 'Maximum attempts before locking the code', 'کوڈ بند ہونے سے پہلے زیادہ سے زیادہ کوششیں', 'कोड बंद होने से पहले अधिकतम प्रयास', 'কোড বন্ধ করার আগে সর্বোচ্চ চেষ্টা'),
  verify_email_link_ttl_hours: L('مدة صلاحية رابط تأكيد البريد بالساعات', 'Email verification link expiry in hours', 'ای میل تصدیقی لنک کی میعاد، گھنٹوں میں', 'ईमेल सत्यापन लिंक की वैधता, घंटों में', 'ইমেইল যাচাই লিংকের মেয়াদ, ঘণ্টায়'),
  verify_allow_guest_browsing: L('السماح بالتصفّح بدون تسجيل دخول', 'Allow browsing without signing in', 'لاگ ان کے بغیر دیکھنے کی اجازت', 'लॉगिन के बिना देखने की अनुमति', 'লগইন ছাড়া ব্রাউজ করার অনুমতি'),
  auth_methods_enabled: L('طرق التسجيل/الدخول المسموحة (username,email,phone,facebook)', 'Allowed signup and sign-in methods (username, email, phone, facebook)', 'رجسٹریشن اور لاگ ان کے اجازت یافتہ طریقے (username, email, phone, facebook)', 'अनुमत पंजीकरण और लॉगिन तरीके (username, email, phone, facebook)', 'অনুমোদিত নিবন্ধন ও লগইন পদ্ধতি (username, email, phone, facebook)'),
  badges_enabled: L('تفعيل خدمة الشارات (موثوق / متميّز)', 'Enable badges (Trusted / Featured)', 'بیجز فعال کریں (قابلِ اعتماد / نمایاں)', 'बैज सक्षम करें (विश्वसनीय / चुनिंदा)', 'ব্যাজ চালু করুন (বিশ্বস্ত / বিশেষ)'),
  badge_trusted_monthly_fee: L('الرسوم الشهرية لشارة «موثوق» (ر.س)', 'Trusted badge monthly fee (SAR)', 'قابلِ اعتماد بیج کی ماہانہ فیس (سعودی ریال)', 'विश्वसनीय बैज का मासिक शुल्क (सऊदी रियाल)', 'বিশ্বস্ত ব্যাজের মাসিক ফি (সৌদি রিয়াল)'),
  badge_trusted_insurance_required: L('يشترط تأمين قابل للاسترداد لشارة «موثوق»؟', 'Require a refundable deposit for the Trusted badge?', 'کیا قابلِ اعتماد بیج کے لیے قابلِ واپسی ضمانتی رقم ضروری ہے؟', 'क्या विश्वसनीय बैज के लिए वापसी योग्य जमा आवश्यक है?', 'বিশ্বস্ত ব্যাজের জন্য ফেরতযোগ্য জামানত প্রয়োজন?'),
  badge_trusted_insurance_amount: L('قيمة التأمين لشارة «موثوق» (ر.س)', 'Trusted badge deposit amount (SAR)', 'قابلِ اعتماد بیج کی ضمانتی رقم (سعودی ریال)', 'विश्वसनीय बैज की जमा राशि (सऊदी रियाल)', 'বিশ্বস্ত ব্যাজের জামানতের পরিমাণ (সৌদি রিয়াল)'),
  badge_featured_monthly_fee: L('الرسوم الشهرية لشارة «متميّز» (ر.س)', 'Featured badge monthly fee (SAR)', 'نمایاں بیج کی ماہانہ فیس (سعودی ریال)', 'चुनिंदा बैज का मासिक शुल्क (सऊदी रियाल)', 'বিশেষ ব্যাজের মাসিক ফি (সৌদি রিয়াল)'),
  badge_featured_insurance_required: L('يشترط تأمين قابل للاسترداد لشارة «متميّز»؟', 'Require a refundable deposit for the Featured badge?', 'کیا نمایاں بیج کے لیے قابلِ واپسی ضمانتی رقم ضروری ہے؟', 'क्या चुनिंदा बैज के लिए वापसी योग्य जमा आवश्यक है?', 'বিশেষ ব্যাজের জন্য ফেরতযোগ্য জামানত প্রয়োজন?'),
  badge_featured_insurance_amount: L('قيمة التأمين لشارة «متميّز» (ر.س)', 'Featured badge deposit amount (SAR)', 'نمایاں بیج کی ضمانتی رقم (سعودی ریال)', 'चुनिंदा बैज की जमा राशि (सऊदी रियाल)', 'বিশেষ ব্যাজের জামানতের পরিমাণ (সৌদি রিয়াল)'),
  badge_duration_days: L('مدة صلاحية الشارة بعد الدفع (أيام)', 'Badge validity after payment (days)', 'ادائیگی کے بعد بیج کی میعاد (دن)', 'भुगतान के बाद बैज की वैधता (दिन)', 'পেমেন্টের পরে ব্যাজের মেয়াদ (দিন)'),
  ads_user_requests_enabled: L('السماح للمستخدمين بطلب نشر إعلانات', 'Allow users to request ad publication', 'صارفین کو اشتہار شائع کرنے کی درخواست دینے کی اجازت', 'उपयोगकर्ताओं को विज्ञापन प्रकाशित करने का अनुरोध करने दें', 'ব্যবহারকারীদের বিজ্ঞাপন প্রকাশের অনুরোধ করতে দিন'),
  ads_price_per_day: L('سعر اليوم الواحد للإعلان (ر.س)', 'Ad price per day (SAR)', 'اشتہار کی یومیہ قیمت (سعودی ریال)', 'विज्ञापन का दैनिक मूल्य (सऊदी रियाल)', 'বিজ্ঞাপনের দৈনিক মূল্য (সৌদি রিয়াল)'),
  ads_price_per_1k_views: L('سعر كل 1000 مشاهدة للإعلان (ر.س)', 'Ad price per 1,000 views (SAR)', 'اشتہار کے ہر 1000 مشاہدات کی قیمت (سعودی ریال)', 'विज्ञापन के प्रति 1,000 दृश्यों का मूल्य (सऊदी रियाल)', 'বিজ্ঞাপনের প্রতি ১,০০০ দর্শনের মূল্য (সৌদি রিয়াল)'),
  ads_min_duration_days: L('الحد الأدنى لمدة الإعلان (أيام)', 'Minimum ad duration (days)', 'اشتہار کی کم از کم مدت (دن)', 'विज्ञापन की न्यूनतम अवधि (दिन)', 'বিজ্ঞাপনের সর্বনিম্ন সময় (দিন)'),
  ads_max_duration_days: L('الحد الأعلى لمدة الإعلان (أيام)', 'Maximum ad duration (days)', 'اشتہار کی زیادہ سے زیادہ مدت (دن)', 'विज्ञापन की अधिकतम अवधि (दिन)', 'বিজ্ঞাপনের সর্বোচ্চ সময় (দিন)'),
  ads_min_views: L('الحد الأدنى لعدد المشاهدات', 'Minimum number of views', 'مشاہدات کی کم از کم تعداد', 'दृश्यों की न्यूनतम संख्या', 'দর্শনের সর্বনিম্ন সংখ্যা'),
  ads_max_views: L('الحد الأعلى لعدد المشاهدات', 'Maximum number of views', 'مشاہدات کی زیادہ سے زیادہ تعداد', 'दृश्यों की अधिकतम संख्या', 'দর্শনের সর্বোচ্চ সংখ্যা'),
  ads_geo_provider: L('مزود الكشف الجغرافي من IP (ip-api / disabled)', 'IP geolocation provider (ip-api / disabled)', 'IP سے جغرافیائی مقام معلوم کرنے والا (ip-api / disabled)', 'IP से स्थान पहचानने वाला प्रदाता (ip-api / disabled)', 'IP থেকে অবস্থান শনাক্তকারী (ip-api / disabled)'),
  ads_geo_cache_days: L('مدة بقاء نتيجة الكشف الجغرافي في الكاش (أيام)', 'Geolocation cache retention (days)', 'جغرافیائی مقام کی معلومات کیش میں رکھنے کی مدت (دن)', 'स्थान की जानकारी कैश में रखने की अवधि (दिन)', 'অবস্থানের তথ্য ক্যাশে রাখার সময় (দিন)'),
  default_country_code: L('الدولة الافتراضية التي تظهر أولاً في النموذج', 'Default country shown first in the form', 'فارم میں پہلے دکھایا جانے والا ملک', 'फ़ॉर्म में पहले दिखाया जाने वाला देश', 'ফর্মে প্রথমে দেখানো ডিফল্ট দেশ'),
  currency_follows_user_country: L('العملة تتبع دولة المستخدم تلقائياً', 'Automatically use the currency of the user’s country', 'صارف کے ملک کی کرنسی خودکار طور پر استعمال کریں', 'उपयोगकर्ता के देश की मुद्रा अपने आप इस्तेमाल करें', 'ব্যবহারকারীর দেশের মুদ্রা স্বয়ংক্রিয়ভাবে ব্যবহার করুন'),
  terms_version: L('إصدار وثيقة الشروط الحالي', 'Current terms document version', 'شرائط کی دستاویز کا موجودہ نسخہ', 'नियमों के दस्तावेज़ का वर्तमान संस्करण', 'শর্তাবলির নথির বর্তমান সংস্করণ'),
  terms_text: L('نص الشروط والأحكام المعروض عند التسجيل', 'Terms and conditions text shown at registration', 'رجسٹریشن کے وقت دکھائی جانے والی شرائط', 'पंजीकरण के समय दिखाए जाने वाले नियम और शर्तें', 'নিবন্ধনের সময় দেখানো শর্তাবলির লেখা'),
});

export function localizedSettingLabel(setting, lang) {
  if (!setting || typeof setting !== 'object') return '';
  const key = typeof setting.setting_key === 'string' ? setting.setting_key : '';
  const description = typeof setting.description === 'string' ? setting.description : '';
  const labels = Object.hasOwn(SETTING_LABELS, key) ? SETTING_LABELS[key] : null;
  return labels && description === labels.ar ? tx(labels, lang) : description || key;
}
