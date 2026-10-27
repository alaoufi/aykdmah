// Lightweight server-side i18n for API response messages.
// Language is resolved per-request from the Accept-Language header
// (see localeMiddleware), defaulting to Arabic.
//
// Adding a new language: append its code to SUPPORTED and add the key to
// every entry in MESSAGES. Missing values fall back through FALLBACK_CHAIN
// before finally returning the message key itself.

const SUPPORTED = ['ar', 'en', 'ur', 'bn', 'hi'];
const DEFAULT_LANG = 'ar';
const FALLBACK_CHAIN = ['en', 'ar'];

const MESSAGES = {
  // generic
  success:            { ar: 'تم بنجاح', en: 'Success', ur: 'کامیاب', bn: 'সফল হয়েছে', hi: 'सफल' },
  updated:            { ar: 'تم التحديث', en: 'Updated', ur: 'اپ ڈیٹ ہو گیا', bn: 'আপডেট হয়েছে', hi: 'अपडेट हुआ' },
  deleted:            { ar: 'تم الحذف', en: 'Deleted', ur: 'حذف ہو گیا', bn: 'মুছে ফেলা হয়েছে', hi: 'हटाया गया' },
  no_updates:         { ar: 'لا تحديثات', en: 'No updates', ur: 'کوئی اپ ڈیٹ نہیں', bn: 'কোনো আপডেট নেই', hi: 'कोई अपडेट नहीं' },
  invalid_data:       { ar: 'بيانات غير صحيحة', en: 'Invalid data', ur: 'غلط ڈیٹا', bn: 'অবৈধ তথ্য', hi: 'अमान्य डेटा' },
  provider_services_required: { ar: 'اختر المهنة وخدمة واحدة على الأقل من خدماتها', en: 'Choose a profession and at least one of its services', ur: 'پیشہ اور اس کی کم از کم ایک خدمت منتخب کریں', bn: 'একটি পেশা এবং তার অন্তত একটি সেবা বেছে নিন', hi: 'एक पेशा और उसकी कम से कम एक सेवा चुनें' },
  provider_phone_required: { ar: 'أدخل رقم جوال صالح للتسجيل كمقدم خدمة', en: 'Enter a valid phone number to register as a service provider', ur: 'خدمت فراہم کنندہ کے طور پر رجسٹر کرنے کے لیے درست فون نمبر درج کریں', bn: 'সেবা প্রদানকারী হিসেবে নিবন্ধন করতে একটি সঠিক ফোন নম্বর দিন', hi: 'सेवा प्रदाता के रूप में पंजीकरण के लिए सही फ़ोन नंबर दर्ज करें' },
  provider_area_required: { ar: 'اختر المدينة والحي الذي تعمل فيه', en: 'Choose the city and neighborhood where you work', ur: 'وہ شہر اور محلہ منتخب کریں جہاں آپ کام کرتے ہیں', bn: 'আপনি যে শহর ও এলাকায় কাজ করেন তা বেছে নিন', hi: 'वह शहर और इलाका चुनें जहाँ आप काम करते हैं' },
  account_phone_unavailable: { ar: 'التسجيل بالجوال غير متاح حاليًا. تواصل مع الإدارة.', en: 'Phone registration is currently unavailable. Contact support.', ur: 'فون کے ذریعے رجسٹریشن فی الحال دستیاب نہیں۔ انتظامیہ سے رابطہ کریں۔', bn: 'ফোন দিয়ে নিবন্ধন এখন চালু নেই। সহায়তার জন্য যোগাযোগ করুন।', hi: 'फ़ोन से पंजीकरण अभी उपलब्ध नहीं है। सहायता के लिए संपर्क करें।' },
  account_profile_required: { ar: 'أكمل الاسم ورقم الجوال والمدينة والحي والعنوان، وأكد موقعك الفعلي على الخريطة.', en: 'Complete your name, phone, city, neighbourhood and address, and confirm your actual location on the map.', ur: 'نام، فون، شہر، محلہ اور پتہ مکمل کریں اور نقشے پر اپنے اصل مقام کی تصدیق کریں۔', bn: 'নাম, ফোন, শহর, এলাকা ও ঠিকানা পূরণ করুন এবং মানচিত্রে আপনার প্রকৃত অবস্থান নিশ্চিত করুন।', hi: 'नाम, फ़ोन, शहर, इलाका और पता भरें तथा मानचित्र पर अपने वास्तविक स्थान की पुष्टि करें।' },
  account_location_required: { ar: 'لحفظ الموقع الافتراضي، اختر المدينة والحي وأدخل العنوان وحدد موقعك الفعلي على الخريطة.', en: 'To save your default location, choose the city and neighbourhood, enter the address and select your actual location on the map.', ur: 'اپنا مستقل مقام محفوظ کرنے کے لیے شہر اور محلہ منتخب کریں، پتہ درج کریں اور نقشے پر اپنا اصل مقام چنیں۔', bn: 'ডিফল্ট অবস্থান সংরক্ষণ করতে শহর ও এলাকা বেছে নিন, ঠিকানা লিখুন এবং মানচিত্রে প্রকৃত অবস্থান নির্বাচন করুন।', hi: 'डिफ़ॉल्ट स्थान सहेजने के लिए शहर और इलाका चुनें, पता लिखें और मानचित्र पर अपना वास्तविक स्थान चुनें।' },
  not_found:          { ar: 'غير موجود', en: 'Not found', ur: 'نہیں ملا', bn: 'পাওয়া যায়নি', hi: 'नहीं मिला' },
  route_not_found:    { ar: 'المسار غير موجود', en: 'Route not found', ur: 'راستہ نہیں ملا', bn: 'রুট পাওয়া যায়নি', hi: 'मार्ग नहीं मिला' },
  server_error:       { ar: 'خطأ داخلي في الخادم', en: 'Internal server error', ur: 'سرور میں اندرونی خرابی', bn: 'অভ্যন্তরীণ সার্ভার ত্রুটি', hi: 'आंतरिक सर्वर त्रुटि' },
  forbidden:          { ar: 'لا تملك صلاحية للوصول', en: 'You do not have permission', ur: 'آپ کو اجازت نہیں', bn: 'আপনার অনুমতি নেই', hi: 'आपके पास अनुमति नहीं है' },
  must_login:         { ar: 'يجب تسجيل الدخول', en: 'You must sign in', ur: 'آپ کو لاگ ان کرنا ہوگا', bn: 'আপনাকে সাইন ইন করতে হবে', hi: 'आपको साइन इन करना होगा' },
  verification_required: { ar: 'أكمل التحقق المطلوب من حسابك في صفحة التوثيق للمتابعة.', en: 'Complete the required account verification on the verification page to continue.', ur: 'جاری رکھنے کے لیے تصدیق کے صفحے پر اپنے اکاؤنٹ کی مطلوبہ تصدیق مکمل کریں۔', bn: 'চালিয়ে যেতে যাচাইকরণ পৃষ্ঠায় আপনার অ্যাকাউন্টের প্রয়োজনীয় যাচাইকরণ সম্পূর্ণ করুন।', hi: 'जारी रखने के लिए सत्यापन पेज पर अपने खाते का आवश्यक सत्यापन पूरा करें।' },
  session_invalid:    { ar: 'الجلسة منتهية أو غير صالحة', en: 'Session expired or invalid', ur: 'سیشن ختم یا غلط ہے', bn: 'সেশনের মেয়াদ শেষ বা অবৈধ', hi: 'सत्र समाप्त या अमान्य' },
  too_many_requests:  { ar: 'تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.', en: 'Too many requests. Try again later.', ur: 'بہت زیادہ درخواستیں۔ بعد میں کوشش کریں۔', bn: 'অনেক বেশি অনুরোধ। পরে চেষ্টা করুন।', hi: 'बहुत अधिक अनुरोध। बाद में पुनः प्रयास करें।' },
  too_many_attempts:  { ar: 'محاولات كثيرة. حاول لاحقاً.', en: 'Too many attempts. Try again later.', ur: 'بہت زیادہ کوششیں۔ بعد میں کوشش کریں۔', bn: 'অনেক বেশি চেষ্টা। পরে চেষ্টা করুন।', hi: 'बहुत अधिक प्रयास। बाद में पुनः प्रयास करें।' },
  too_many_uploads:   { ar: 'تجاوزت حد رفع الملفات. حاول لاحقاً.', en: 'Upload limit exceeded. Try again later.', ur: 'اپ لوڈ کی حد ختم۔ بعد میں کوشش کریں۔', bn: 'আপলোডের সীমা অতিক্রান্ত। পরে চেষ্টা করুন।', hi: 'अपलोड सीमा पार। बाद में पुनः प्रयास करें।' },

  // install
  not_installed:      { ar: 'النظام غير مثبت بعد. يرجى زيارة /install', en: 'System not installed yet. Please visit /install', ur: 'سسٹم ابھی انسٹال نہیں ہوا۔ /install ملاحظہ کریں', bn: 'সিস্টেম এখনও ইনস্টল হয়নি। দয়া করে /install ভিজিট করুন', hi: 'सिस्टम अभी इंस्टॉल नहीं हुआ। कृपया /install पर जाएं' },
  already_installed:  { ar: 'تم تثبيت النظام مسبقاً. يرجى حذف القفل يدوياً إذا كنت تريد إعادة التثبيت.', en: 'System already installed. Remove the lock manually to reinstall.', ur: 'سسٹم پہلے سے انسٹال ہے۔ دوبارہ انسٹال کے لیے لاک ہٹائیں۔', bn: 'সিস্টেম ইতিমধ্যে ইনস্টল করা আছে। পুনরায় ইনস্টল করতে ম্যানুয়ালি লক সরান।', hi: 'सिस्टम पहले से इंस्टॉल है। पुनः इंस्टॉल के लिए लॉक मैन्युअल हटाएं।' },

  // auth
  account_created:    { ar: 'تم إنشاء الحساب بنجاح', en: 'Account created successfully', ur: 'اکاؤنٹ کامیابی سے بن گیا', bn: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে', hi: 'खाता सफलतापूर्वक बनाया गया' },
  email_taken:        { ar: 'البريد مسجل مسبقاً', en: 'Email already registered', ur: 'ای میل پہلے سے رجسٹرڈ ہے', bn: 'ইমেইল ইতিমধ্যে নিবন্ধিত', hi: 'ईमेल पहले से पंजीकृत' },
  username_taken:     { ar: 'اسم المستخدم مسجل مسبقاً', en: 'Username already taken', ur: 'یوزر نام پہلے سے لیا گیا ہے', bn: 'ব্যবহারকারীর নাম ইতিমধ্যে নেওয়া হয়েছে', hi: 'उपयोगकर्ता नाम पहले से लिया गया' },
  facebook_taken:     { ar: 'حساب فيسبوك مسجل مسبقاً', en: 'Facebook account already linked', ur: 'فیس بک اکاؤنٹ پہلے سے منسلک', bn: 'ফেসবুক অ্যাকাউন্ট ইতিমধ্যে যুক্ত', hi: 'फेसबुक खाता पहले से जुड़ा' },
  need_one_identifier:{ ar: 'يجب إدخال طريقة دخول واحدة على الأقل (اسم مستخدم / جوال / بريد / فيسبوك)', en: 'Provide at least one sign-in identifier (username / phone / email / facebook)', ur: 'کم از کم ایک شناختی طریقہ درج کریں', bn: 'অন্তত একটি সাইন-ইন পরিচয় দিন', hi: 'कम से कम एक साइन-इन पहचान दें' },
  phone_taken:        { ar: 'الهاتف مسجل مسبقاً', en: 'Phone already registered', ur: 'فون پہلے سے رجسٹرڈ ہے', bn: 'ফোন ইতিমধ্যে নিবন্ধিত', hi: 'फ़ोन पहले से पंजीकृत' },
  invalid_credentials:{ ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials', ur: 'غلط لاگ ان معلومات', bn: 'ভুল লগইন তথ্য', hi: 'अमान्य प्रमाण-पत्र' },
  account_inactive:   { ar: 'حسابك غير مفعل', en: 'Your account is inactive', ur: 'آپ کا اکاؤنٹ غیر فعال ہے', bn: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয়', hi: 'आपका खाता निष्क्रिय है' },
  account_blocked:    { ar: 'حسابك محظور', en: 'Your account is blocked', ur: 'آپ کا اکاؤنٹ بلاک ہے', bn: 'আপনার অ্যাকাউন্ট ব্লক করা হয়েছে', hi: 'आपका खाता ब्लॉक है' },
  account_not_found:  { ar: 'الحساب غير موجود', en: 'Account not found', ur: 'اکاؤنٹ نہیں ملا', bn: 'অ্যাকাউন্ট পাওয়া যায়নি', hi: 'खाता नहीं मिला' },
  logged_in:          { ar: 'تم تسجيل الدخول', en: 'Signed in', ur: 'لاگ ان ہو گئے', bn: 'সাইন ইন হয়েছে', hi: 'साइन इन हो गए' },
  logged_out:         { ar: 'تم تسجيل الخروج', en: 'Signed out', ur: 'لاگ آؤٹ ہو گئے', bn: 'সাইন আউট হয়েছে', hi: 'साइन आउट हो गए' },
  password_changed:   { ar: 'تم تغيير كلمة المرور', en: 'Password changed', ur: 'پاس ورڈ تبدیل ہو گیا', bn: 'পাসওয়ার্ড পরিবর্তিত হয়েছে', hi: 'पासवर्ड बदल दिया गया' },
  current_password_wrong: { ar: 'كلمة المرور الحالية غير صحيحة', en: 'Current password is incorrect', ur: 'موجودہ پاس ورڈ غلط ہے', bn: 'বর্তমান পাসওয়ার্ড ভুল', hi: 'वर्तमान पासवर्ड गलत है' },

  // profile
  profile_updated:    { ar: 'تم تحديث الملف الشخصي', en: 'Profile updated', ur: 'پروفائل اپ ڈیٹ ہو گئی', bn: 'প্রোফাইল আপডেট হয়েছে', hi: 'प्रोफ़ाइल अपडेट हुई' },
  provider_updated:   { ar: 'تم تحديث ملف الخدمة', en: 'Provider profile updated', ur: 'فراہم کنندہ پروفائل اپ ڈیٹ ہو گئی', bn: 'প্রদানকারীর প্রোফাইল আপডেট হয়েছে', hi: 'प्रदाता प्रोफ़ाइल अपडेट हुई' },

  // users (admin)
  user_blocked:       { ar: 'تم حظر المستخدم', en: 'User blocked', ur: 'صارف بلاک ہو گیا', bn: 'ব্যবহারকারী ব্লক হয়েছে', hi: 'उपयोगकर्ता ब्लॉक हुआ' },
  user_unblocked:     { ar: 'تم رفع الحظر', en: 'User unblocked', ur: 'بلاک ہٹا دیا گیا', bn: 'ব্যবহারকারী আনব্লক হয়েছে', hi: 'उपयोगकर्ता अनब्लॉक हुआ' },
  user_deleted:       { ar: 'تم حذف المستخدم', en: 'User deleted', ur: 'صارف حذف ہو گیا', bn: 'ব্যবহারকারী মুছে ফেলা হয়েছে', hi: 'उपयोगकर्ता हटाया गया' },
  cannot_block_self:  { ar: 'لا يمكن حظر نفسك', en: 'You cannot block yourself', ur: 'آپ خود کو بلاک نہیں کر سکتے', bn: 'আপনি নিজেকে ব্লক করতে পারবেন না', hi: 'आप स्वयं को ब्लॉक नहीं कर सकते' },
  cannot_delete_self: { ar: 'لا يمكن حذف نفسك', en: 'You cannot delete yourself', ur: 'آپ خود کو حذف نہیں کر سکتے', bn: 'আপনি নিজেকে মুছতে পারবেন না', hi: 'आप स्वयं को हटा नहीं सकते' },

  // requests
  request_created:    { ar: 'تم إنشاء الطلب', en: 'Request created', ur: 'درخواست بن گئی', bn: 'অনুরোধ তৈরি হয়েছে', hi: 'अनुरोध बनाया गया' },
  request_deleted:    { ar: 'تم حذف الطلب', en: 'Request deleted', ur: 'درخواست حذف ہو گئی', bn: 'অনুরোধ মুছে ফেলা হয়েছে', hi: 'अनुरोध हटाया गया' },
  request_not_found:  { ar: 'الطلب غير موجود', en: 'Request not found', ur: 'درخواست نہیں ملی', bn: 'অনুরোধ পাওয়া যায়নি', hi: 'अनुरोध नहीं मिला' },
  request_not_open:   { ar: 'الطلب لم يعد مفتوحاً', en: 'This request is no longer open', ur: 'یہ درخواست اب کھلی نہیں', bn: 'এই অনুরোধটি আর খোলা নেই', hi: 'यह अनुरोध अब खुला नहीं है' },
  status_updated:     { ar: 'تم تحديث الحالة', en: 'Status updated', ur: 'حیثیت اپ ڈیٹ ہو گئی', bn: 'অবস্থা আপডেট হয়েছে', hi: 'स्थिति अपडेट हुई' },
  invalid_status:     { ar: 'حالة غير صحيحة', en: 'Invalid status', ur: 'غلط حیثیت', bn: 'অবৈধ অবস্থা', hi: 'अमान्य स्थिति' },

  // offers
  offer_sent:         { ar: 'تم إرسال العرض', en: 'Offer sent', ur: 'پیشکش بھیج دی گئی', bn: 'অফার পাঠানো হয়েছে', hi: 'ऑफ़र भेजा गया' },
  offer_accepted:     { ar: 'تم قبول العرض', en: 'Offer accepted', ur: 'پیشکش قبول ہو گئی', bn: 'অফার গৃহীত হয়েছে', hi: 'ऑफ़र स्वीकार हुआ' },
  offer_rejected:     { ar: 'تم رفض العرض', en: 'Offer rejected', ur: 'پیشکش مسترد ہو گئی', bn: 'অফার প্রত্যাখ্যাত হয়েছে', hi: 'ऑफ़र अस्वीकार हुआ' },
  offer_not_found:    { ar: 'العرض غير موجود', en: 'Offer not found', ur: 'پیشکش نہیں ملی', bn: 'অফার পাওয়া যায়নি', hi: 'ऑफ़र नहीं मिला' },
  providers_only:     { ar: 'لمقدمي الخدمة فقط', en: 'Providers only', ur: 'صرف فراہم کنندگان کے لیے', bn: 'শুধুমাত্র প্রদানকারীদের জন্য', hi: 'केवल प्रदाताओं के लिए' },

  // notifications (title/body)
  notif_new_offer_title:    { ar: 'عرض سعر جديد', en: 'New quote received', ur: 'نئی قیمت کی پیشکش', bn: 'নতুন দর প্রাপ্ত', hi: 'नया कोटेशन प्राप्त' },
  notif_new_offer_body:     { ar: 'قدم {{name}} عرضاً بقيمة {{price}}', en: '{{name}} sent an offer of {{price}}', ur: '{{name}} نے {{price}} کی پیشکش بھیجی', bn: '{{name}} {{price}} এর একটি অফার পাঠিয়েছেন', hi: '{{name}} ने {{price}} का ऑफ़र भेजा' },
  notif_offer_accepted_title:{ ar: 'تم قبول عرضك', en: 'Your offer was accepted', ur: 'آپ کی پیشکش قبول ہو گئی', bn: 'আপনার অফার গৃহীত হয়েছে', hi: 'आपका ऑफ़र स्वीकार हुआ' },
  notif_offer_accepted_body: { ar: 'قبل العميل عرضك على: {{title}}', en: 'The client accepted your offer on: {{title}}', ur: 'کلائنٹ نے آپ کی پیشکش قبول کی: {{title}}', bn: 'ক্লায়েন্ট আপনার অফার গ্রহণ করেছেন: {{title}}', hi: 'ग्राहक ने आपका ऑफ़र स्वीकार किया: {{title}}' },
  notif_offer_rejected_title:{ ar: 'تم رفض عرضك', en: 'Your offer was rejected', ur: 'آپ کی پیشکش مسترد ہو گئی', bn: 'আপনার অফার প্রত্যাখ্যাত হয়েছে', hi: 'आपका ऑफ़र अस्वीकार हुआ' },
  notif_offer_rejected_body: { ar: 'للأسف، تم رفض عرضك', en: 'Unfortunately, your offer was rejected', ur: 'بدقسمتی سے، آپ کی پیشکش مسترد ہو گئی', bn: 'দুর্ভাগ্যবশত, আপনার অফার প্রত্যাখ্যাত হয়েছে', hi: 'दुर्भाग्य से, आपका ऑफ़र अस्वीकार कर दिया गया' },
  notif_request_completed_title: { ar: 'اكتمل الطلب', en: 'Request completed', ur: 'درخواست مکمل ہو گئی', bn: 'অনুরোধ সম্পন্ন হয়েছে', hi: 'अनुरोध पूर्ण हुआ' },
  notif_new_message_title:  { ar: 'رسالة جديدة', en: 'New message', ur: 'نیا پیغام', bn: 'নতুন বার্তা', hi: 'नया संदेश' },
  notif_new_attachment:     { ar: 'مرفق جديد', en: 'New attachment', ur: 'نیا منسلک', bn: 'নতুন সংযুক্তি', hi: 'नया अनुलग्नक' },
  notif_new_review_title:   { ar: 'تقييم جديد', en: 'New review', ur: 'نیا جائزہ', bn: 'নতুন পর্যালোচনা', hi: 'नई समीक्षा' },

  // reviews
  review_sent:        { ar: 'تم إرسال التقييم', en: 'Review submitted', ur: 'جائزہ جمع ہو گیا', bn: 'পর্যালোচনা জমা হয়েছে', hi: 'समीक्षा जमा हुई' },
  review_exists:      { ar: 'تم تقييم الطلب مسبقاً', en: 'This request was already reviewed', ur: 'اس درخواست کا جائزہ پہلے ہو چکا', bn: 'এই অনুরোধটি ইতিমধ্যে পর্যালোচনা করা হয়েছে', hi: 'इस अनुरोध की पहले ही समीक्षा हो चुकी है' },
  must_complete_first:{ ar: 'يجب اكتمال الطلب قبل التقييم', en: 'Request must be completed before review', ur: 'جائزے سے پہلے درخواست مکمل ہونی چاہیے', bn: 'পর্যালোচনার আগে অনুরোধটি সম্পূর্ণ হতে হবে', hi: 'समीक्षा से पहले अनुरोध पूरा होना चाहिए' },
  reply_added:        { ar: 'تم إضافة الرد', en: 'Reply added', ur: 'جواب شامل ہو گیا', bn: 'উত্তর যোগ হয়েছে', hi: 'उत्तर जोड़ा गया' },

  // chat
  message_empty:      { ar: 'الرسالة فارغة', en: 'Message is empty', ur: 'پیغام خالی ہے', bn: 'বার্তা খালি', hi: 'संदेश खाली है' },
  cannot_chat_self:   { ar: 'لا يمكن محادثة نفسك', en: 'You cannot message yourself', ur: 'آپ خود کو پیغام نہیں بھیج سکتے', bn: 'আপনি নিজেকে বার্তা পাঠাতে পারবেন না', hi: 'आप स्वयं को संदेश नहीं भेज सकते' },
  chat_needs_two:     { ar: 'لا يمكن بدء محادثة بدون طرفين', en: 'A conversation needs two participants', ur: 'بات چیت کے لیے دو فریق درکار', bn: 'একটি কথোপকথনের জন্য দুই অংশগ্রহণকারী প্রয়োজন', hi: 'बातचीत के लिए दो प्रतिभागी आवश्यक हैं' },
  no_assigned_provider:{ ar: 'لا يوجد مزود معيّن', en: 'No assigned provider', ur: 'کوئی فراہم کنندہ مقرر نہیں', bn: 'কোনো নিযুক্ত প্রদানকারী নেই', hi: 'कोई असाइन किया गया प्रदाता नहीं' },
  read_marked:        { ar: 'تم وضع علامة قراءة', en: 'Marked as read', ur: 'پڑھا ہوا قرار دیا', bn: 'পঠিত হিসেবে চিহ্নিত', hi: 'पढ़ा हुआ चिह्नित' },
  all_read:           { ar: 'تم وضع جميع الإشعارات كمقروءة', en: 'All notifications marked as read', ur: 'تمام اطلاعات پڑھی ہوئی قرار', bn: 'সমস্ত বিজ্ঞপ্তি পঠিত হিসেবে চিহ্নিত', hi: 'सभी सूचनाएं पढ़ी हुई चिह्नित' },

  // settings / misc
  settings_updated:   { ar: 'تم تحديث الإعدادات', en: 'Settings updated', ur: 'ترتیبات اپ ڈیٹ ہو گئیں', bn: 'সেটিংস আপডেট হয়েছে', hi: 'सेटिंग्स अपडेट हुईं' },
  type_invalid:       { ar: 'النوع غير صحيح', en: 'Invalid type', ur: 'غلط قسم', bn: 'অবৈধ ধরন', hi: 'अमान्य प्रकार' },
  user_id_required:   { ar: 'user_id مطلوب', en: 'user_id is required', ur: 'user_id درکار ہے', bn: 'user_id প্রয়োজন', hi: 'user_id आवश्यक है' },
  amount_invalid:     { ar: 'المبلغ غير صحيح', en: 'Invalid amount', ur: 'غلط رقم', bn: 'অবৈধ পরিমাণ', hi: 'अमान्य राशि' },
  file_type_blocked:  { ar: 'نوع الملف غير مسموح', en: 'File type not allowed', ur: 'فائل کی قسم کی اجازت نہیں', bn: 'ফাইলের ধরন অনুমোদিত নয়', hi: 'फ़ाइल प्रकार अनुमत नहीं' },
  file_ext_blocked:   { ar: 'امتداد الملف غير مسموح', en: 'File extension not allowed', ur: 'فائل ایکسٹینشن کی اجازت نہیں', bn: 'ফাইল এক্সটেনশন অনুমোদিত নয়', hi: 'फ़ाइल एक्सटेंशन अनुमत नहीं' },
  file_content_invalid: { ar: 'محتوى الملف غير صالح أو لا يطابق نوعه.', en: 'The file content is invalid or does not match its format.', ur: 'فائل کا مواد درست نہیں یا اس کی قسم سے مطابقت نہیں رکھتا۔', bn: 'ফাইলের বিষয়বস্তু অবৈধ অথবা তার ধরনটির সঙ্গে মেলে না।', hi: 'फ़ाइल की सामग्री अमान्य है या उसके प्रकार से मेल नहीं खाती।' },
  upload_body_limit:  { ar: 'إجمالي الطلب والمرفقات يجب أن يكون أقل من 4 ميجابايت.', en: 'The total request and attachments must be smaller than 4 MiB.', ur: 'درخواست اور منسلک فائلوں کا مجموعی حجم 4 میبی بائٹ سے کم ہونا چاہیے۔', bn: 'অনুরোধ ও সংযুক্ত ফাইলগুলোর মোট আকার 4 মেবিবাইটের কম হতে হবে।', hi: 'अनुरोध और संलग्न फ़ाइलों का कुल आकार 4 मेबिबाइट से कम होना चाहिए।' },

  // subscriptions
  plan_not_found:     { ar: 'الباقة غير موجودة', en: 'Plan not found', ur: 'پلان نہیں ملا', bn: 'প্ল্যান পাওয়া যায়নি', hi: 'योजना नहीं मिली' },
  free_subscribed:    { ar: 'تم الاشتراك في الباقة المجانية', en: 'Subscribed to the free plan', ur: 'مفت پلان سبسکرائب ہو گیا', bn: 'বিনামূল্যে প্ল্যানে সাবস্ক্রাইব করা হয়েছে', hi: 'मुफ़्त योजना सब्सक्राइब हुई' },
  sub_created_pay:    { ar: 'تم إنشاء الاشتراك. أكمل الدفع.', en: 'Subscription created. Complete the payment.', ur: 'سبسکرپشن بن گئی۔ ادائیگی مکمل کریں۔', bn: 'সাবস্ক্রিপশন তৈরি হয়েছে। পেমেন্ট সম্পূর্ণ করুন।', hi: 'सदस्यता बनाई गई। भुगतान पूरा करें।' },
  sub_cancelled:      { ar: 'تم إلغاء الاشتراك', en: 'Subscription cancelled', ur: 'سبسکرپشن منسوخ ہو گئی', bn: 'সাবস্ক্রিপশন বাতিল হয়েছে', hi: 'सदस्यता रद्द हुई' },
  sub_activated:      { ar: 'تم تفعيل اشتراكك', en: 'Your subscription is active', ur: 'آپ کی سبسکرپشن فعال ہو گئی', bn: 'আপনার সাবস্ক্রিপশন সক্রিয় হয়েছে', hi: 'आपकी सदस्यता सक्रिय है' },
  payment_success:    { ar: 'تمت عملية الدفع بنجاح', en: 'Payment successful', ur: 'ادائیگی کامیاب', bn: 'পেমেন্ট সফল হয়েছে', hi: 'भुगतान सफल' },
  ad_created:         { ar: 'تم إنشاء الإعلان', en: 'Ad created', ur: 'اشتہار بن گیا', bn: 'বিজ্ঞাপন তৈরি হয়েছে', hi: 'विज्ञापन बनाया गया' },
  verification_updated:{ ar: 'تم تحديث حالة التوثيق', en: 'Verification status updated', ur: 'تصدیق کی حیثیت اپ ڈیٹ ہو گئی', bn: 'যাচাইকরণ অবস্থা আপডেট হয়েছে', hi: 'सत्यापन स्थिति अपडेट हुई' },

  // dispute workflow
  dispute_blocks_review:    { ar: 'لا يمكن إضافة تقييم أثناء وجود نزاع نشط على هذا الطلب', en: 'Ratings are blocked while a dispute is active on this order', ur: 'اس آرڈر پر فعال تنازعہ کے دوران ریٹنگ بلاک ہے', bn: 'এই অর্ডারে সক্রিয় বিরোধের সময় রেটিং ব্লক করা হয়েছে', hi: 'इस ऑर्डर पर सक्रिय विवाद के दौरान रेटिंग ब्लॉक है' },
  ratings_blocked:          { ar: 'تم تعطيل التقييم لهذا الطلب بقرار من الإدارة', en: 'Ratings have been disabled for this order by an admin', ur: 'ایڈمن نے اس آرڈر کی ریٹنگ بند کر دی', bn: 'অ্যাডমিন এই অর্ডারের রেটিং নিষ্ক্রিয় করেছেন', hi: 'एडमिन ने इस ऑर्डर की रेटिंग अक्षम की' },
  dispute_opened_title:     { ar: 'فُتح نزاع', en: 'Dispute opened', ur: 'تنازعہ کھلا', bn: 'বিরোধ খোলা হয়েছে', hi: 'विवाद खोला गया' },
  dispute_resolved_title:   { ar: 'تم حل النزاع', en: 'Dispute resolved', ur: 'تنازعہ حل ہو گیا', bn: 'বিরোধ সমাধান হয়েছে', hi: 'विवाद हल हो गया' },
  dispute_status_changed:   { ar: 'تحديث حالة النزاع', en: 'Dispute status updated', ur: 'تنازعہ کی حیثیت اپ ڈیٹ', bn: 'বিরোধ অবস্থা আপডেট', hi: 'विवाद स्थिति अपडेट' },
  dispute_new_message:      { ar: 'رسالة جديدة في النزاع', en: 'New dispute message', ur: 'تنازعہ میں نیا پیغام', bn: 'বিরোধে নতুন বার্তা', hi: 'विवाद में नया संदेश' },
  badges_disabled:          { ar: 'خدمة الشارات معطّلة حالياً', en: 'Badges are currently disabled', ur: 'بیجز فی الحال غیر فعال ہیں', bn: 'ব্যাজ এখন নিষ্ক্রিয়', hi: 'बैज वर्तमान में अक्षम हैं' },
  badge_already_in_flight:  { ar: 'لديك طلب نشط لهذه الشارة بالفعل', en: 'You already have an open request for this badge', ur: 'اس بیج کے لیے آپ کی پہلے سے درخواست موجود ہے', bn: 'এই ব্যাজের জন্য আপনার ইতিমধ্যে একটি অনুরোধ রয়েছে', hi: 'इस बैज के लिए आपका पहले से अनुरोध है' },
  badge_requested:          { ar: 'تم إرسال طلب الشارة. سيتم مراجعته من الإدارة', en: 'Badge request submitted. Awaiting admin review', ur: 'بیج کی درخواست بھیج دی۔ ایڈمن جائزہ لے گا', bn: 'ব্যাজ অনুরোধ পাঠানো হয়েছে। অ্যাডমিন পর্যালোচনার অপেক্ষায়', hi: 'बैज अनुरोध भेजा गया। एडमिन समीक्षा प्रतीक्षित' },
  badge_approved:           { ar: 'تمت الموافقة على الشارة. يمكن للمستخدم الدفع الآن', en: 'Badge approved. Provider can now pay', ur: 'بیج منظور۔ سروس فراہم کنندہ اب ادائیگی کر سکتا ہے', bn: 'ব্যাজ অনুমোদিত। প্রদানকারী এখন পেমেন্ট করতে পারবেন', hi: 'बैज स्वीकृत। प्रदाता अब भुगतान कर सकते हैं' },
  badge_rejected:           { ar: 'تم رفض طلب الشارة', en: 'Badge request rejected', ur: 'بیج کی درخواست مسترد', bn: 'ব্যাজ অনুরোধ প্রত্যাখ্যাত', hi: 'बैज अनुरोध अस्वीकृत' },
  badge_activated:          { ar: 'تم تفعيل الشارة', en: 'Badge activated', ur: 'بیج فعال ہو گیا', bn: 'ব্যাজ সক্রিয়', hi: 'बैज सक्रिय' },
  badge_not_approved_yet:   { ar: 'لا يمكن الدفع قبل موافقة الإدارة', en: 'Cannot pay before admin approval', ur: 'ایڈمن منظوری سے پہلے ادائیگی ممکن نہیں', bn: 'অ্যাডমিন অনুমোদনের আগে পেমেন্ট সম্ভব নয়', hi: 'एडमिन की मंजूरी से पहले भुगतान संभव नहीं' },
  badge_wrong_state:        { ar: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية', en: 'Action not allowed in current state', ur: 'موجودہ حالت میں یہ عمل ممکن نہیں', bn: 'বর্তমান অবস্থায় এই কাজ অনুমোদিত নয়', hi: 'वर्तमान स्थिति में यह कार्य अनुमत नहीं' },
  cannot_cancel_now:        { ar: 'لا يمكن الإلغاء في الحالة الحالية', en: 'Cannot cancel in current state', ur: 'موجودہ حالت میں منسوخ نہیں کیا جا سکتا', bn: 'বর্তমান অবস্থায় বাতিল করা যাবে না', hi: 'वर्तमान स्थिति में रद्द नहीं किया जा सकता' },
  cancelled:                { ar: 'تم الإلغاء', en: 'Cancelled', ur: 'منسوخ کر دیا', bn: 'বাতিল করা হয়েছে', hi: 'रद्द किया गया' },
  ads_user_requests_disabled:{ ar: 'طلبات الإعلانات معطّلة حالياً', en: 'User ad requests are disabled', ur: 'صارف اشتہار درخواستیں غیر فعال ہیں', bn: 'ব্যবহারকারী বিজ্ঞাপন অনুরোধ নিষ্ক্রিয়', hi: 'उपयोगकर्ता विज्ञापन अनुरोध अक्षम हैं' },
  ad_invalid_duration:      { ar: 'مدة الإعلان خارج الحد المسموح', en: 'Duration out of allowed range', ur: 'دورانیہ حد سے باہر', bn: 'সময়কাল অনুমোদিত সীমার বাইরে', hi: 'अवधि अनुमत सीमा से बाहर' },
  ad_invalid_views:         { ar: 'عدد المشاهدات خارج الحد المسموح', en: 'View count out of allowed range', ur: 'مشاہدات کی تعداد حد سے باہر', bn: 'ভিউ গণনা অনুমোদিত সীমার বাইরে', hi: 'दृश्य संख्या अनुमत सीमा से बाहर' },
  ad_invalid_placement:     { ar: 'مكان عرض الإعلان غير صحيح', en: 'Invalid placement', ur: 'اشتہار کی جگہ غلط', bn: 'বিজ্ঞাপনের অবস্থান অবৈধ', hi: 'विज्ञापन स्थान अमान्य' },
  ad_request_sent:          { ar: 'تم إرسال طلب الإعلان للمراجعة', en: 'Ad request submitted for review', ur: 'اشتہار درخواست جائزے کے لیے بھیج دی', bn: 'বিজ্ঞাপন অনুরোধ পর্যালোচনার জন্য পাঠানো হয়েছে', hi: 'विज्ञापन अनुरोध समीक्षा के लिए भेजा गया' },
  ad_payment_received:      { ar: 'تم تسجيل الدفعة. سيتم تنشيط الإعلان من قبل الإدارة قريباً', en: 'Payment recorded. Admin will activate the ad shortly', ur: 'ادائیگی موصول۔ ایڈمن جلد ہی اشتہار فعال کرے گا', bn: 'পেমেন্ট গৃহীত। অ্যাডমিন শীঘ্রই বিজ্ঞাপন সক্রিয় করবেন', hi: 'भुगतान प्राप्त। एडमिन शीघ्र ही विज्ञापन सक्रिय करेंगे' },
  ad_not_approved_yet:      { ar: 'لا يمكن الدفع قبل موافقة الإدارة', en: 'Cannot pay before admin approval', ur: 'ایڈمن منظوری سے پہلے ادائیگی ممکن نہیں', bn: 'অ্যাডমিন অনুমোদনের আগে পেমেন্ট সম্ভব নয়', hi: 'एडमिन की मंजूरी से पहले भुगतान संभव नहीं' },
  ad_wrong_state:           { ar: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية', en: 'Action not allowed in current state', ur: 'موجودہ حالت میں یہ عمل ممکن نہیں', bn: 'বর্তমান অবস্থায় এই কাজ অনুমোদিত নয়', hi: 'वर्तमान स्थिति में यह कार्य अनुमत नहीं' },
  ad_approved:              { ar: 'تمت الموافقة على الإعلان', en: 'Ad approved', ur: 'اشتہار منظور', bn: 'বিজ্ঞাপন অনুমোদিত', hi: 'विज्ञापन स्वीकृत' },
  ad_rejected:              { ar: 'تم رفض الإعلان', en: 'Ad rejected', ur: 'اشتہار مسترد', bn: 'বিজ্ঞাপন প্রত্যাখ্যাত', hi: 'विज्ञापन अस्वीकृत' },
  ad_activated:             { ar: 'تم تنشيط الإعلان', en: 'Ad activated', ur: 'اشتہار فعال', bn: 'বিজ্ঞাপন সক্রিয়', hi: 'विज्ञापन सक्रिय' },
};

function pickLang(acceptLanguage) {
  if (!acceptLanguage) return DEFAULT_LANG;
  // Take the first language tag, e.g. "en-US,en;q=0.9" -> "en"
  const first = String(acceptLanguage).split(',')[0].trim().slice(0, 2).toLowerCase();
  return SUPPORTED.includes(first) ? first : DEFAULT_LANG;
}

function translate(lang, key, vars) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  // resolve with explicit lang → fallback chain → first available
  let str = entry[lang];
  if (!str) for (const fb of FALLBACK_CHAIN) { if (entry[fb]) { str = entry[fb]; break; } }
  if (!str) str = entry[Object.keys(entry)[0]] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), () => String(v));
    }
  }
  return str;
}

// Express middleware: attaches req.lang and req.t(key, vars)
function localeMiddleware(req, res, next) {
  req.lang = pickLang(req.headers['accept-language']);
  req.t = (key, vars) => translate(req.lang, key, vars);
  next();
}

module.exports = { translate, pickLang, localeMiddleware, SUPPORTED, DEFAULT_LANG, FALLBACK_CHAIN };
