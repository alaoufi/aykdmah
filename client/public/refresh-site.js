(function () {
  var language = 'ar';
  try { language = (localStorage.getItem('lsm_lang') || 'ar').slice(0, 2); } catch (_) {}
  var copy = {
    ar: ['جارٍ فتح أحدث نسخة…', 'إعادة المحاولة'],
    en: ['Opening the latest version…', 'Try again'],
    ur: ['تازہ ترین ورژن کھولا جا رہا ہے…', 'دوبارہ کوشش کریں'],
    hi: ['नवीनतम संस्करण खोला जा रहा है…', 'फिर से कोशिश करें'],
    bn: ['সর্বশেষ সংস্করণ খোলা হচ্ছে…', 'আবার চেষ্টা করুন']
  };
  copy = copy[language] || copy.ar;
  document.documentElement.lang = language;
  document.documentElement.dir = ['ar', 'ur'].indexOf(language) >= 0 ? 'rtl' : 'ltr';
  document.getElementById('refresh-title').textContent = copy[0];
  var retry = document.getElementById('refresh-retry');
  retry.textContent = copy[1];
  function openLatest() {
    // This network-only entry bypasses navigation fallbacks in old app workers.
    // Leave account storage untouched and return to the home page after cleanup.
    history.replaceState(history.state, '', '/' + location.search + location.hash);
    if (window.__AYK_ASSET_RECOVERY__) window.__AYK_ASSET_RECOVERY__.reloadFresh();
    else location.replace('/?_aykdmh_refresh=' + Date.now());
  }
  retry.addEventListener('click', openLatest);
  openLatest();
})();
