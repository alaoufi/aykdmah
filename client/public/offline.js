(function () {
  var translations = {
    ar: ['أي خدمة', 'أنت غير متصل بالإنترنت', 'تأكد من اتصال الإنترنت ثم حاول مرة أخرى.', 'إعادة المحاولة'],
    en: ['AY KHIDMA', 'You are offline', 'Check your internet connection, then try again.', 'Try again'],
    ur: ['AY KHIDMA', 'آپ انٹرنیٹ سے منسلک نہیں ہیں', 'اپنا انٹرنیٹ کنکشن چیک کریں اور دوبارہ کوشش کریں۔', 'دوبارہ کوشش کریں'],
    hi: ['AY KHIDMA', 'आप इंटरनेट से कनेक्ट नहीं हैं', 'अपना इंटरनेट कनेक्शन जाँचें, फिर दोबारा कोशिश करें।', 'दोबारा कोशिश करें'],
    bn: ['AY KHIDMA', 'আপনি ইন্টারনেটে সংযুক্ত নন', 'আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।', 'আবার চেষ্টা করুন'],
  };
  var language = 'ar';
  try { language = (localStorage.getItem('lsm_lang') || 'ar').split('-')[0]; } catch (_) {}
  if (!translations[language]) language = 'ar';
  var messages = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' || language === 'ur' ? 'rtl' : 'ltr';
  document.title = messages[0] + ' — ' + messages[1];
  document.getElementById('offline-title').textContent = messages[1];
  document.getElementById('offline-message').textContent = messages[2];
  var retry = document.getElementById('retry');
  retry.textContent = messages[3];
  retry.addEventListener('click', function () { location.reload(); });
  var logo = document.getElementById('logo');
  logo.setAttribute('alt', messages[0]);
})();
