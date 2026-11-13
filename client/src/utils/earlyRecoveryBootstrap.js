// Combined with chunkRecovery.js into a classic script by the build plugin.
// It runs before the application entry, so an entry MIME error is recoverable.
(function () {
  if (window.__AYK_ASSET_RECOVERY__) return;
  const version = document.querySelector('meta[name="aykdmh-build"]')?.content || 'unknown';
  let pending = false;
  const options = { window, version, skipEarlyDelegate: true };
  const recovery = {
    version, isChunkLoadError,
    recover(error) {
      if (pending) return false;
      const accepted = recoverFromChunkFailure(error, options);
      if (accepted) pending = true;
      return accepted;
    },
    reloadFresh() {
      if (pending) return false;
      const accepted = reloadFreshShell(options);
      if (accepted) pending = true;
      return accepted;
    },
  };
  window.__AYK_ASSET_RECOVERY__ = recovery;
  installChunkRecovery({ window });

  function entryFallback() {
    const root = document.getElementById('root');
    if (!root || root.childNodes.length) return;
    let lang = 'ar';
    try { lang = (localStorage.getItem('lsm_lang') || 'ar').split(/[-_]/)[0]; } catch (_) {}
    const copies = {
      ar: ['تعذّر تحميل الموقع', 'أعد تحميل الصفحة للحصول على أحدث نسخة.', 'إعادة التحميل'],
      en: ['Unable to load the site', 'Reload this page to get the latest version.', 'Reload'],
      ur: ['سائٹ لوڈ نہیں ہو سکی', 'تازہ ترین ورژن کے لیے صفحہ دوبارہ لوڈ کریں۔', 'دوبارہ لوڈ کریں'],
      hi: ['साइट लोड नहीं हो सकी', 'नवीनतम संस्करण के लिए पेज फिर से लोड करें।', 'फिर से लोड करें'],
      bn: ['সাইট লোড করা যায়নি', 'সর্বশেষ সংস্করণের জন্য পৃষ্ঠাটি আবার লোড করুন।', 'আবার লোড করুন'],
      ml: ['സൈറ്റ് ലോഡ് ചെയ്യാനായില്ല', 'ഏറ്റവും പുതിയ പതിപ്പിനായി ഈ പേജ് വീണ്ടും ലോഡ് ചെയ്യുക.', 'വീണ്ടും ലോഡ് ചെയ്യുക'],
      fil: ['Hindi ma-load ang site', 'I-reload ang pahinang ito para makuha ang pinakabagong bersyon.', 'I-reload'],
      id: ['Situs tidak dapat dimuat', 'Muat ulang halaman ini untuk mendapatkan versi terbaru.', 'Muat ulang'],
      ne: ['साइट लोड गर्न सकिएन', 'नयाँ संस्करणका लागि यो पृष्ठ फेरि लोड गर्नुहोस्।', 'फेरि लोड गर्नुहोस्'],
      am: ['ድረ-ገጹን መጫን አልተቻለም', 'የቅርብ ጊዜውን ስሪት ለማግኘት ይህን ገጽ እንደገና ይጫኑ።', 'እንደገና ጫን'],
      tr: ['Site yüklenemedi', 'En son sürümü almak için bu sayfayı yeniden yükleyin.', 'Yeniden yükle'],
    };
    const copy = copies[lang] || copies.ar;
    const box = document.createElement('div');
    box.className = 'error-state';
    const title = document.createElement('h2');
    const body = document.createElement('p');
    const button = document.createElement('button');
    title.textContent = copy[0];
    body.textContent = copy[1];
    button.textContent = copy[2];
    button.className = 'btn btn-primary';
    button.addEventListener('click', () => recovery.reloadFresh());
    box.append(title, body, button);
    root.appendChild(box);
  }

  window.addEventListener('error', event => {
    const script = event.target;
    if (script?.tagName !== 'SCRIPT' || script.type !== 'module' || !script.src) return;
    if (new URL(script.src, location.href).origin !== location.origin) return;
    if (!recovery.recover(new Error('Failed to load module script: ' + script.src))) entryFallback();
  }, true);
})();
