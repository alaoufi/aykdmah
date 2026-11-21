// AYK-281: scripts run, so the text copy for search engines stays hidden (index.html).
try { document.documentElement.classList.add('js'); } catch (_) {}

// AYK-334: the page is not drawn before the server says this copy is current (AYK-323). The
// question was asked only after the app's main file had been read, so its whole trip was spent
// waiting. It is asked here, at the very first line, while that file is still being read.
try {
  if (navigator.onLine !== false && window.fetch) {
    window.__aykVersion = fetch('/version.json', { cache: 'no-store' })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (v) { return (v && v.version) || null; })
      .catch(function () { return null; });
  }
} catch (_) {}

// AYK-334: the same for a signed-in person's account, which the first page waits for. Any answer
// but a good one is dropped, and the app asks again in its usual way (which handles sign-out).
try {
  var aykAdmin = /^\/admin(\/|$)/.test(location.pathname);
  var aykToken = localStorage.getItem(aykAdmin ? 'lsm_admin_token' : 'lsm_token');
  if (aykToken && navigator.onLine !== false && window.fetch) {
    var aykHeaders = { Authorization: 'Bearer ' + aykToken, Accept: 'application/json' };
    if (aykAdmin) aykHeaders['X-Ayk-Scope'] = 'admin';
    var aykLang = String(localStorage.getItem('lsm_lang') || 'ar').toLowerCase().split(/[-_]/)[0];
    aykHeaders['Accept-Language'] = /^(ar|en|ur|hi|bn|ml|fil|id|ne|am|tr)$/.test(aykLang) ? aykLang : 'ar';
    window.__aykMe = {
      token: aykToken,
      promise: fetch('/api/auth/me', { headers: aykHeaders, credentials: 'same-origin', cache: 'no-store' })
        .then(function (res) { return res && res.ok ? res.json() : null; })
        .then(function (body) { return (body && body.data && body.data.user) ? body.data : null; })
        .catch(function () { return null; })
    };
  }
} catch (_) {}

(function () {
  // AYK-266: the web fonts load without holding back the first paint (index.html loads them as
  // media="print"); they are switched on as soon as they arrive.
  try {
    var fonts = document.getElementById('ayk-fonts');
    if (fonts) {
      var on = function () { fonts.media = 'all'; };
      if (fonts.sheet) on(); else { fonts.addEventListener('load', on); fonts.addEventListener('error', on); }
    }
  } catch (_) {}
})();

(function () {
  // Runs before React: base theme, contrast and text size from saved preferences.
  try {
    var root = document.documentElement;
    var prefs = JSON.parse(localStorage.getItem('ayk_theme_prefs') || 'null');
    var legacy = localStorage.getItem('ayk_theme');
    var mode = prefs && prefs.mode ? prefs.mode : (legacy === 'dark' ? 'dark' : 'light');
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'default');
    var scales = { s: 0.92, m: 1, l: 1.1, xl: 1.22 };
    var scale = prefs && scales[prefs.scale];
    if (prefs && prefs.scale) root.setAttribute('data-scale', prefs.scale);
    if (scale && scale !== 1) { root.style.zoom = String(scale); root.style.setProperty('--ayk-scale', String(scale)); }
    if (prefs && prefs.contrast === true) root.setAttribute('data-contrast', 'high');
  } catch (_) {}
})();
