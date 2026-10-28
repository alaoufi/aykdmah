import axios from 'axios';
import i18n, { SUPPORTED_LANG_CODES } from '../i18n';

const baseURL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${baseURL}/api`,
  withCredentials: false,
  timeout: 30000,
});

export const TOKEN_KEY = 'lsm_token';
export const TOKEN_CHANGE_EVENT = 'ayk:session-change';
let memoryToken = null;
let memoryOnly = false;

export function getToken() {
  if (memoryOnly) return memoryToken;
  try { return localStorage.getItem(TOKEN_KEY); } catch (_) { memoryOnly = true; return memoryToken; }
}
export function setToken(token) {
  const previous = getToken();
  memoryToken = typeof token === 'string' && token ? token : null;
  try {
    if (memoryToken) localStorage.setItem(TOKEN_KEY, memoryToken);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('lsm_auth_session');
  } catch (_) { memoryOnly = true; /* Keep the current session usable when storage is unavailable. */ }
  if (globalThis.caches) void caches.delete('api-cache').catch(() => {});
  if (previous !== memoryToken && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  // Resolve this at dispatch time so changing language also changes API
  // validation and account messages without a reload.
  if (!config.headers.has('Accept-Language')) {
    const language = String(i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2).toLowerCase();
    config.headers.set('Accept-Language', SUPPORTED_LANG_CODES.includes(language) ? language : 'en');
  }
  return config;
}, undefined, { synchronous: true });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      const url = String(err.config?.url || '');
      const credentialCheck = /^\/auth\/(login|password)(?:\?|$)/.test(url);
      const authorization = err.config?.headers?.get?.('Authorization')
        || err.config?.headers?.Authorization;
      const requestToken = typeof authorization === 'string'
        ? authorization.replace(/^Bearer\s+/i, '') : null;
      // An expired request from a previous session must not sign out a newer
      // session. Incorrect login/current-password entries are form errors.
      if (!credentialCheck && requestToken && requestToken === getToken()) {
        setToken(null);
        const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath;
        }
      }
    }
    return Promise.reject(err);
  }
);

// Known response codes and legacy translated messages resolve to UI keys.
// Unknown server/transport messages can contain diagnostics or private data;
// keep those out of the interface and show a translated explanation instead.
const errorKeys = new Map();
const errorMessages = new Map();
const statusErrorKeys = new Map([
  [400, 'errors.invalid_data'], [401, 'errors.unauthorized'], [403, 'errors.forbidden'],
  [404, 'errors.not_found'], [409, 'errors.conflict'], [422, 'errors.invalid_data'],
  [429, 'errors.too_many_requests'],
]);

for (const [code, key, messages] of [
  ["invalid_data", "errors.invalid_data", ["بيانات غير صحيحة","Invalid data","غلط ڈیٹا","অবৈধ তথ্য","अमान्य डेटा"]],
  ["type_invalid", "errors.invalid_data", ["النوع غير صحيح","Invalid type","غلط قسم","অবৈধ ধরন","अमान्य प्रकार"]],
  ["user_id_required", "errors.invalid_data", ["user_id مطلوب","user_id is required","user_id درکار ہے","user_id প্রয়োজন","user_id आवश्यक है"]],
  ["amount_invalid", "errors.invalid_data", ["المبلغ غير صحيح","Invalid amount","غلط رقم","অবৈধ পরিমাণ","अमान्य राशि"]],
  ["file_type_blocked", "errors.invalid_data", ["نوع الملف غير مسموح","File type not allowed","فائل کی قسم کی اجازت نہیں","ফাইলের ধরন অনুমোদিত নয়","फ़ाइल प्रकार अनुमत नहीं"]],
  ["file_ext_blocked", "errors.invalid_data", ["امتداد الملف غير مسموح","File extension not allowed","فائل ایکسٹینشن کی اجازت نہیں","ফাইল এক্সটেনশন অনুমোদিত নয়","फ़ाइल एक्सटेंशन अनुमत नहीं"]],
  ["message_empty", "errors.invalid_data", ["الرسالة فارغة","Message is empty","پیغام خالی ہے","বার্তা খালি","संदेश खाली है"]],
  ["cannot_chat_self", "errors.invalid_data", ["لا يمكن محادثة نفسك","You cannot message yourself","آپ خود کو پیغام نہیں بھیج سکتے","আপনি নিজেকে বার্তা পাঠাতে পারবেন না","आप स्वयं को संदेश नहीं भेज सकते"]],
  ["chat_needs_two", "errors.invalid_data", ["لا يمكن بدء محادثة بدون طرفين","A conversation needs two participants","بات چیت کے لیے دو فریق درکار","একটি কথোপকথনের জন্য দুই অংশগ্রহণকারী প্রয়োজন","बातचीत के लिए दो प्रतिभागी आवश्यक हैं"]],
  ["server_error", "errors.generic", ["خطأ داخلي في الخادم","Internal server error","سرور میں اندرونی خرابی","অভ্যন্তরীণ সার্ভার ত্রুটি","आंतरिक सर्वर त्रुटि"]],
  ["not_found", "errors.not_found", ["غير موجود","Not found","نہیں ملا","পাওয়া যায়নি","नहीं मिला"]],
  ["route_not_found", "errors.not_found", ["المسار غير موجود","Route not found","راستہ نہیں ملا","রুট পাওয়া যায়নি","मार्ग नहीं मिला"]],
  ["plan_not_found", "errors.not_found", ["الباقة غير موجودة","Plan not found","پلان نہیں ملا","প্ল্যান পাওয়া যায়নি","योजना नहीं मिली"]],
  ["account_not_found", "errors.not_found", ["الحساب غير موجود","Account not found","اکاؤنٹ نہیں ملا","অ্যাকাউন্ট পাওয়া যায়নি","खाता नहीं मिला"]],
  ["forbidden", "errors.forbidden", ["لا تملك صلاحية للوصول","You do not have permission","آپ کو اجازت نہیں","আপনার অনুমতি নেই","आपके पास अनुमति नहीं है"]],
  ["cannot_block_self", "errors.forbidden", ["لا يمكن حظر نفسك","You cannot block yourself","آپ خود کو بلاک نہیں کر سکتے","আপনি নিজেকে ব্লক করতে পারবেন না","आप स्वयं को ब्लॉक नहीं कर सकते"]],
  ["cannot_delete_self", "errors.forbidden", ["لا يمكن حذف نفسك","You cannot delete yourself","آپ خود کو حذف نہیں کر سکتے","আপনি নিজেকে মুছতে পারবেন না","आप स्वयं को हटा नहीं सकते"]],
  ["badges_disabled", "errors.forbidden", ["خدمة الشارات معطّلة حالياً","Badges are currently disabled","بیجز فی الحال غیر فعال ہیں","ব্যাজ এখন নিষ্ক্রিয়","बैज वर्तमान में अक्षम हैं"]],
  ["ads_user_requests_disabled", "errors.forbidden", ["طلبات الإعلانات معطّلة حالياً","User ad requests are disabled","صارف اشتہار درخواستیں غیر فعال ہیں","ব্যবহারকারী বিজ্ঞাপন অনুরোধ নিষ্ক্রিয়","उपयोगकर्ता विज्ञापन अनुरोध अक्षम हैं"]],
  ["must_login", "errors.unauthorized", ["يجب تسجيل الدخول","You must sign in","آپ کو لاگ ان کرنا ہوگا","আপনাকে সাইন ইন করতে হবে","आपको साइन इन करना होगा"]],
  ["session_invalid", "errors.unauthorized", ["الجلسة منتهية أو غير صالحة","Session expired or invalid","سیشن ختم یا غلط ہے","সেশনের মেয়াদ শেষ বা অবৈধ","सत्र समाप्त या अमान्य"]],
  ["too_many_requests", "errors.too_many_requests", ["تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.","Too many requests. Try again later.","بہت زیادہ درخواستیں۔ بعد میں کوشش کریں۔","অনেক বেশি অনুরোধ। পরে চেষ্টা করুন।","बहुत अधिक अनुरोध। बाद में पुनः प्रयास करें।"]],
  ["too_many_attempts", "errors.too_many_requests", ["محاولات كثيرة. حاول لاحقاً.","Too many attempts. Try again later.","بہت زیادہ کوششیں۔ بعد میں کوشش کریں۔","অনেক বেশি চেষ্টা। পরে চেষ্টা করুন।","बहुत अधिक प्रयास। बाद में पुनः प्रयास करें।"]],
  ["too_many_uploads", "errors.too_many_requests", ["تجاوزت حد رفع الملفات. حاول لاحقاً.","Upload limit exceeded. Try again later.","اپ لوڈ کی حد ختم۔ بعد میں کوشش کریں۔","আপলোডের সীমা অতিক্রান্ত। পরে চেষ্টা করুন।","अपलोड सीमा पार। बाद में पुनः प्रयास करें।"]],
  ["invalid_status", "errors.invalid_status", ["حالة غير صحيحة","Invalid status","غلط حیثیت","অবৈধ অবস্থা","अमान्य स्थिति"]],
  ["must_complete_first", "errors.invalid_status", ["يجب اكتمال الطلب قبل التقييم","Request must be completed before review","جائزے سے پہلے درخواست مکمل ہونی چاہیے","পর্যালোচনার আগে অনুরোধটি সম্পূর্ণ হতে হবে","समीक्षा से पहले अनुरोध पूरा होना चाहिए"]],
  ["badge_not_approved_yet", "errors.invalid_status", ["لا يمكن الدفع قبل موافقة الإدارة","Cannot pay before admin approval","ایڈمن منظوری سے پہلے ادائیگی ممکن نہیں","অ্যাডমিন অনুমোদনের আগে পেমেন্ট সম্ভব নয়","एडमिन की मंजूरी से पहले भुगतान संभव नहीं"]],
  ["badge_wrong_state", "errors.invalid_status", ["لا يمكن تنفيذ هذا الإجراء في الحالة الحالية","Action not allowed in current state","موجودہ حالت میں یہ عمل ممکن نہیں","বর্তমান অবস্থায় এই কাজ অনুমোদিত নয়","वर्तमान स्थिति में यह कार्य अनुमत नहीं"]],
  ["ad_not_approved_yet", "errors.invalid_status", ["لا يمكن الدفع قبل موافقة الإدارة","Cannot pay before admin approval","ایڈمن منظوری سے پہلے ادائیگی ممکن نہیں","অ্যাডমিন অনুমোদনের আগে পেমেন্ট সম্ভব নয়","एडमिन की मंजूरी से पहले भुगतान संभव नहीं"]],
  ["ad_wrong_state", "errors.invalid_status", ["لا يمكن تنفيذ هذا الإجراء في الحالة الحالية","Action not allowed in current state","موجودہ حالت میں یہ عمل ممکن نہیں","বর্তমান অবস্থায় এই কাজ অনুমোদিত নয়","वर्तमान स्थिति में यह कार्य अनुमत नहीं"]],
  ["cannot_cancel_now", "errors.invalid_status", ["لا يمكن الإلغاء في الحالة الحالية","Cannot cancel in current state","موجودہ حالت میں منسوخ نہیں کیا جا سکتا","বর্তমান অবস্থায় বাতিল করা যাবে না","वर्तमान स्थिति में रद्द नहीं किया जा सकता"]],
  ["current_password_wrong", "errors.current_password_wrong", ["كلمة المرور الحالية غير صحيحة","Current password is incorrect","موجودہ پاس ورڈ غلط ہے","বর্তমান পাসওয়ার্ড ভুল","वर्तमान पासवर्ड गलत है"]],
  ["account_inactive", "errors.account_inactive", ["حسابك غير مفعل","Your account is inactive","آپ کا اکاؤنٹ غیر فعال ہے","আপনার অ্যাকাউন্ট নিষ্ক্রিয়","आपका खाता निष्क्रिय है"]],
  ["verification_required", "errors.verification_required", ["أكمل التحقق المطلوب من حسابك في صفحة التوثيق للمتابعة.","Complete the required account verification on the verification page to continue.","جاری رکھنے کے لیے تصدیق کے صفحے پر اپنے اکاؤنٹ کی مطلوبہ تصدیق مکمل کریں۔","চালিয়ে যেতে যাচাইকরণ পৃষ্ঠায় আপনার অ্যাকাউন্টের প্রয়োজনীয় যাচাইকরণ সম্পূর্ণ করুন।","जारी रखने के लिए सत्यापन पेज पर अपने खाते का आवश्यक सत्यापन पूरा करें।"]],
  ["badge_already_in_flight", "errors.conflict", ["لديك طلب نشط لهذه الشارة بالفعل","You already have an open request for this badge","اس بیج کے لیے آپ کی پہلے سے درخواست موجود ہے","এই ব্যাজের জন্য আপনার ইতিমধ্যে একটি অনুরোধ রয়েছে","इस बैज के लिए आपका पहले से अनुरोध है"]],
  ["invalid_credentials", "auth.invalid_credentials", ["بيانات الدخول غير صحيحة","Invalid credentials","غلط لاگ ان معلومات","ভুল লগইন তথ্য","अमान्य प्रमाण-पत्र"]],
  ["account_blocked", "auth.account_blocked", ["حسابك محظور","Your account is blocked","آپ کا اکاؤنٹ بلاک ہے","আপনার অ্যাকাউন্ট ব্লক করা হয়েছে","आपका खाता ब्लॉक है"]],
  ["email_taken", "auth.identity_in_use_hint", ["البريد مسجل مسبقاً","Email already registered","ای میل پہلے سے رجسٹرڈ ہے","ইমেইল ইতিমধ্যে নিবন্ধিত","ईमेल पहले से पंजीकृत"]],
  ["username_taken", "auth.identity_in_use_hint", ["اسم المستخدم مسجل مسبقاً","Username already taken","یوزر نام پہلے سے لیا گیا ہے","ব্যবহারকারীর নাম ইতিমধ্যে নেওয়া হয়েছে","उपयोगकर्ता नाम पहले से लिया गया"]],
  ["phone_taken", "auth.identity_in_use_hint", ["الهاتف مسجل مسبقاً","Phone already registered","فون پہلے سے رجسٹرڈ ہے","ফোন ইতিমধ্যে নিবন্ধিত","फ़ोन पहले से पंजीकृत"]],
  ["facebook_taken", "auth.identity_in_use_hint", ["حساب فيسبوك مسجل مسبقاً","Facebook account already linked","فیس بک اکاؤنٹ پہلے سے منسلک","ফেসবুক অ্যাকাউন্ট ইতিমধ্যে যুক্ত","फेसबुक खाता पहले से जुड़ा"]],
  ["need_one_identifier", "auth.identifiers_hint", ["يجب إدخال طريقة دخول واحدة على الأقل (اسم مستخدم / جوال / بريد / فيسبوك)","Provide at least one sign-in identifier (username / phone / email / facebook)","کم از کم ایک شناختی طریقہ درج کریں","অন্তত একটি সাইন-ইন পরিচয় দিন","कम से कम एक साइन-इन पहचान दें"]],
  ["provider_phone_required", "auth.provider_phone_required", ["أدخل رقم جوال صالح للتسجيل كمقدم خدمة","Enter a valid phone number to register as a service provider","خدمت فراہم کنندہ کے طور پر رجسٹر کرنے کے لیے درست فون نمبر درج کریں","সেবা প্রদানকারী হিসেবে নিবন্ধন করতে একটি সঠিক ফোন নম্বর দিন","सेवा प्रदाता के रूप में पंजीकरण के लिए सही फ़ोन नंबर दर्ज करें"]],
  ["provider_area_required", "auth.provider_area_required", ["اختر المدينة والحي الذي تعمل فيه","Choose the city and neighborhood where you work","وہ شہر اور محلہ منتخب کریں جہاں آپ کام کرتے ہیں","আপনি যে শহর ও এলাকায় কাজ করেন তা বেছে নিন","वह शहर और इलाका चुनें जहाँ आप काम करते हैं"]],
  ["provider_services_required", "provider.services_required", ["اختر المهنة وخدمة واحدة على الأقل من خدماتها","Choose a profession and at least one of its services","پیشہ اور اس کی کم از کم ایک خدمت منتخب کریں","একটি পেশা এবং তার অন্তত একটি সেবা বেছে নিন","एक पेशा और उसकी कम से कम एक सेवा चुनें"]],
  ["request_not_found", "request.not_found", ["الطلب غير موجود","Request not found","درخواست نہیں ملی","অনুরোধ পাওয়া যায়নি","अनुरोध नहीं मिला"]],
  ["request_not_open", "request.no_longer_open", ["الطلب لم يعد مفتوحاً","This request is no longer open","یہ درخواست اب کھلی نہیں","এই অনুরোধটি আর খোলা নেই","यह अनुरोध अब खुला नहीं है"]],
  ["offer_not_found", "offer.not_found", ["العرض غير موجود","Offer not found","پیشکش نہیں ملی","অফার পাওয়া যায়নি","ऑफ़र नहीं मिला"]],
  ["phone_invalid", "auth.phone_invalid", ["رقم الجوال غير صحيح. اكتبه بعشرة أرقام يبدأ بـ 05، مثل 0512345678","The mobile number is not valid. Enter 10 digits starting with 05, e.g. 0512345678","موبائل نمبر درست نہیں۔ 05 سے شروع ہونے والے 10 ہندسے لکھیں، جیسے 0512345678","মোবাইল নম্বর সঠিক নয়। 05 দিয়ে শুরু ১০ অঙ্ক লিখুন, যেমন 0512345678","मोबाइल नंबर सही नहीं है। 05 से शुरू होने वाले 10 अंक लिखें, जैसे 0512345678"]],
  ["sms_failed", "auth.sms_failed", ["تعذر إرسال رمز التحقق. تأكد من رقم الجوال وحاول بعد قليل","The verification code could not be sent. Check the number and try again shortly","تصدیقی کوڈ نہیں بھیجا جا سکا۔ نمبر چیک کریں اور تھوڑی دیر بعد کوشش کریں","যাচাইকরণ কোড পাঠানো যায়নি। নম্বর দেখে একটু পরে চেষ্টা করুন","सत्यापन कोड नहीं भेजा जा सका। नंबर जाँचें और थोड़ी देर बाद कोशिश करें"]],
  ["sms_unavailable", "auth.sms_unavailable", ["استعادة كلمة المرور بالجوال غير متاحة حاليًا. تواصل مع الإدارة","Password recovery by phone is not available yet. Contact the administration","فون کے ذریعے پاس ورڈ بحالی ابھی دستیاب نہیں۔ انتظامیہ سے رابطہ کریں","ফোনে পাসওয়ার্ড পুনরুদ্ধার এখনো চালু নেই। প্রশাসনের সাথে যোগাযোগ করুন","फ़ोन से पासवर्ड वापसी अभी उपलब्ध नहीं है। प्रशासन से संपर्क करें"]],
  ["role_change_active_jobs", "auth.role_change_active_jobs", ["لديك طلبات جارية كمقدم خدمة. أكملها أو ألغها أولًا، ثم غيّر نوع الحساب.","You have jobs in progress as a provider. Finish or cancel them first, then change the account type.","بطور فراہم کنندہ آپ کے کام جاری ہیں۔ پہلے انہیں مکمل یا منسوخ کریں، پھر اکاؤنٹ کی قسم بدلیں۔","প্রদানকারী হিসেবে আপনার কাজ চলছে। আগে সেগুলো শেষ বা বাতিল করুন, তারপর অ্যাকাউন্টের ধরন বদলান।","प्रदाता के रूप में आपके काम चल रहे हैं। पहले उन्हें पूरा या रद्द करें, फिर खाते का प्रकार बदलें।"]],
  ["role_change_open_requests", "auth.role_change_open_requests", ["لديك طلبات خدمة مفتوحة. اختر «كلاهما» لتبقى قادرًا على متابعتها، أو أكملها أولًا.","You have open service requests. Choose “Both” to keep following them, or finish them first.","آپ کی خدمت کی درخواستیں کھلی ہیں۔ انہیں جاری رکھنے کے لیے «دونوں» منتخب کریں، یا پہلے مکمل کریں۔","আপনার সেবা অনুরোধ খোলা আছে। সেগুলো চালিয়ে যেতে “উভয়” বেছে নিন, বা আগে শেষ করুন।","आपके सेवा अनुरोध खुले हैं। उन्हें जारी रखने के लिए “दोनों” चुनें, या पहले पूरा करें।"]],
  ["account_type_changed", "auth.account_type_changed", ["تم تغيير نوع الحساب","Account type changed","اکاؤنٹ کی قسم بدل گئی","অ্যাকাউন্টের ধরন বদলেছে","खाते का प्रकार बदल गया"]],
  ["provider_venue_point_required", "auth.provider_venue_point_required", ["حدد موقع مكان تقديم الخدمة على الخريطة","Mark the service venue on the map","نقشے پر خدمت کی جگہ منتخب کریں","মানচিত্রে সেবার স্থান চিহ্নিত করুন","मानचित्र पर सेवा स्थान चुनें"]],
  ["providers_only", "offer.providers_only", ["لمقدمي الخدمة فقط","Providers only","صرف فراہم کنندگان کے لیے","শুধুমাত্র প্রদানকারীদের জন্য","केवल प्रदाताओं के लिए"]]
]) {
  errorKeys.set(code, key);
  for (const message of messages) errorMessages.set(message, key);
}

export function apiError(err) {
  const response = err?.response;
  const status = Number(response?.status);
  const data = response?.data;
  let key;

  // 502/503 carry a known server message (e.g. the SMS code could not be sent); other 5xx stay generic.
  if (status >= 500 && !((status === 502 || status === 503) && errorMessages.has(String(data?.message || '').trim()))) key = 'errors.generic';
  if (!key && typeof data?.code === 'string') key = errorKeys.get(data.code);
  if (!key && typeof data?.message === 'string') key = errorMessages.get(data.message.trim());

  const path = typeof err?.config?.url === 'string' ? err.config.url : '';
  if (!key && status === 401 && /^\/auth\/password(?:\?|$)/.test(path)) key = 'errors.current_password_wrong';
  if (!key && status === 401 && /^\/auth\/login(?:\?|$)/.test(path)) key = 'auth.invalid_credentials';
  if (!key && status === 409 && Array.isArray(data?.errors) && data.errors.some(item =>
    ['email', 'phone', 'username', 'facebook_id'].includes(item?.field))) key = 'auth.identity_in_use_hint';
  if (!key && status === 409 && /^\/auth\/register(?:\?|$)/.test(path)) key = 'auth.identity_in_use_hint';
  if (!key) key = statusErrorKeys.get(status);
  if (!key && !response && (err?.isAxiosError || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(err?.code))) key = 'errors.network';
  return i18n.t(key || 'errors.generic');
}

export default api;
