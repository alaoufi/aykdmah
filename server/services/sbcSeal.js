// AYK-474 (the owner: «الذي يهمني صفحة البيانات تفتح مباشرة»): tapping «متجر موثّق» opens this store's
// certificate page at the Saudi Business Center straight away. That page's address carries a signed mark the
// centre issues and expires, so it cannot be fixed in the site; the centre's own seal (the embed it gives each
// store, keyed by the store's seal code) always holds a fresh one. We read it from there and send the visitor on.
const SBC_BASE = 'https://eauthenticate.saudibusiness.gov.sa';
const SEAL_TOKEN = 'QkgzZE9CcXdpcWsvaUUyY1JjZ3BvQT09'; // «أي خدمة», certificate 0000338868 (given by the owner)
const CERT = '0000338868';
const INQUIRY = `${SBC_BASE}/inquiry`;
const KEEP_MS = 10 * 60 * 1000; // the seal's marks last longer; reuse one for ten minutes

let cached = { url: '', until: 0 };

function certificateLink(html, cert = CERT) {
  const re = new RegExp(`href="(${SBC_BASE.replace(/[.]/g, '\\.')}/certificate-details/${cert}\\?vt=[^"]+)"`);
  const m = String(html || '').match(re);
  return m ? m[1].replace(/&amp;/g, '&') : '';
}

async function freshCertificateUrl({ fetchImpl = globalThis.fetch, now = Date.now(), lang = 'ar' } = {}) {
  if (cached.url && cached.until > now) return cached.url;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetchImpl(`${SBC_BASE}/EAuthSealApi/seal?token=${encodeURIComponent(SEAL_TOKEN)}&lang=${lang === 'en' ? 'en' : 'ar'}&pos=bottom`,
      { signal: ctrl.signal, headers: { accept: 'text/html' } });
    clearTimeout(timer);
    const url = res && res.ok ? certificateLink(await res.text()) : '';
    if (url) { cached = { url, until: now + KEEP_MS }; return url; }
  } catch (_) { /* the centre unreachable: fall back to its inquiry page */ }
  return INQUIRY;
}

function resetCache() { cached = { url: '', until: 0 }; }

module.exports = { freshCertificateUrl, certificateLink, resetCache, INQUIRY, CERT };
